import { defineMiddleware } from 'astro:middleware';
import { getSession } from './lib/auth';
import { db } from './db';
import { companies } from './db/schema';
import { eq } from 'drizzle-orm';
import { getLocaleFromCookie } from './lib/i18n';
import { rateLimitAsync, getClientIp } from './lib/security';
import { captureError } from './lib/observability';
import { licenseState } from './lib/license';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function isCrossOrigin(request: Request, host: string | null): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  if (!origin && !referer) return false;
  const expected = host ? new Set([`https://${host}`, `http://${host}`]) : null;
  if (origin && expected && !expected.has(origin)) return true;
  if (origin && !expected) {
    try {
      const ohost = new URL(origin).host;
      if (host && ohost !== host) return true;
    } catch { return true; }
  }
  if (!origin && referer) {
    try {
      const rhost = new URL(referer).host;
      if (host && rhost !== host) return true;
    } catch { return true; }
  }
  return false;
}

function applySecurityHeaders(response: Response, pathname: string): Response {
  // Don't mutate already-streamed responses; clone headers via Headers init.
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=(), payment=()');
  // Cross-origin isolation + opener policies — protect against Spectre-class
  // side-channel leaks across windows / iframes.
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  // Forensic watermark — every response carries a per-request ID. If data
  // leaks, audit_log.metadata pairs the ID with the userId who pulled it.
  // Generated below in onRequest wrapper.
  // CSP: keep relaxed for inline scripts (Astro dev) but lock down third-party.
  // Allow self + Vercel Blob + Mapbox/Leaflet tiles + Resend tracking pixel.
  if (!headers.has('Content-Security-Policy')) {
    // Note on inline scripts: Astro still emits a small inline bootstrap
    // for hydration. Dropping 'unsafe-inline' from script-src needs a
    // nonce pipeline through every <script> in the codebase — out of
    // scope for now. We DO drop 'unsafe-eval' (nothing legitimately
    // needs it) and we narrow connect-src / img-src to known third
    // parties instead of any-https.
    const csp = [
      "default-src 'self'",
      // Vercel Blob for uploaded docs/logos, Unsplash/avatar CDNs, Mapbox/
      // Leaflet tiles, Stripe (3DS). data: + blob: for inline previews.
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.tile.openstreetmap.org https://tiles.openfreemap.org https://*.mapbox.com https://images.unsplash.com https://*.googleusercontent.com https://*.gravatar.com https://q.stripe.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "worker-src 'self' blob:",
      // No 'unsafe-eval' anymore. Allowed scripts: self, inline (Astro
      // bootstrap), Stripe, Turnstile, Vercel Analytics. cdn.jsdelivr +
      // unpkg covered by Leaflet/etc.
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com https://js.stripe.com https://va.vercel-scripts.com",
      "frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://hooks.stripe.com",
      // Narrow connect-src from any-https to APIs we actually call.
      "connect-src 'self' https://api.stripe.com https://*.upstash.io https://*.vercel.app https://*.public.blob.vercel-storage.com https://webservicesp.anaf.ro https://api.anaf.ro https://energy.ec.europa.eu https://nominatim.openstreetmap.org https://tiles.openfreemap.org https://unpkg.com wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; ');
    headers.set('Content-Security-Policy', csp);
  }
  // HSTS only meaningful over HTTPS — Vercel terminates TLS so always on.
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function applyRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const method = context.request.method.toUpperCase();

  // Forensic per-request ID (16-char base36). Echoed in X-Request-ID header
  // and exposed via context.locals.requestId so handlers can include it in
  // audit_log.metadata. If a data leak surfaces, the ID maps to the user.
  const requestId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  context.locals.requestId = requestId;

  // i18n: read locale from cookie (default 'ro'), available everywhere via Astro.locals.locale
  context.locals.locale = getLocaleFromCookie(context.request.headers.get('cookie'));

  // CSRF: reject cross-origin mutating requests on /api/* (skip cron — Vercel cron has Bearer)
  if (
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/cron/') &&
    !pathname.startsWith('/api/webhooks/') &&
    !pathname.startsWith('/api/v1/') &&
    !pathname.startsWith('/api/auth/apple/callback') &&
    MUTATING_METHODS.has(method)
  ) {
    const host = context.request.headers.get('host');
    if (isCrossOrigin(context.request, host)) {
      return new Response(JSON.stringify({ error: 'Cerere refuzată (cross-origin)' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Rate limiting on hot endpoints (auth, posting, bidding, messaging)
  if (pathname.startsWith('/api/') && MUTATING_METHODS.has(method)) {
    const ip = getClientIp(context.request);
    let limit = 60; // default per minute
    let bucket = 'api';
    if (pathname === '/api/public/waitlist') { limit = 5; bucket = 'waitlist'; }
    else if (pathname.startsWith('/api/auth/')) { limit = 10; bucket = 'auth'; }
    else if (
      pathname.startsWith('/api/invoicing/') ||
      pathname.startsWith('/api/anaf/') ||
      pathname.startsWith('/api/checkout')
    ) { limit = 30; bucket = 'mutate'; }
    const rl = await rateLimitAsync(`${bucket}:${ip}`, limit, 60_000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Prea multe cereri. Încearcă mai târziu.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(rl.resetIn / 1000)),
        },
      });
    }
  }

  // Public routes — no auth needed
  if (
    pathname === '/' ||
    pathname === '/despre' ||
    pathname === '/contact' ||
    pathname === '/faq' ||
    pathname === '/asistenta' ||
    pathname === '/termeni' ||
    pathname === '/confidentialitate' ||
    pathname === '/preturi' ||
    pathname === '/functii' ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/public/') ||
    pathname === '/api/locale' ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/v1/') ||
    pathname.startsWith('/factura/')
  ) {
    context.locals.user = null;
    context.locals.company = null;
    // Optional auth: if the visitor has a valid session, populate it so
    // dual-mode layouts (ToolLayout, etc.) can render the dashboard chrome
    // instead of the public marketing chrome. Failures are silent — these
    // routes remain accessible to anonymous users.
    try {
      const cookieHeader = context.request.headers.get('cookie');
      if (cookieHeader && cookieHeader.includes('session=')) {
        const result = await getSession(cookieHeader);
        if (result) {
          const { user } = result;
          const isAdmin = (user as any).isAdmin === true || user.userType === 'admin';
          context.locals.user = {
            id: user.id,
            platformId: user.platformId,
            email: user.email,
            name: user.name,
            userType: user.userType as any,
            companyId: user.companyId || null,
            parentUserId: user.parentUserId || null,
            isSubUser: !!user.parentUserId,
            isAdmin,
            avatarUrl: user.avatarUrl || null,
            phone: user.phone || null,
            onboardingSeenAt: (user as any).onboardingSeenAt ?? null,
            isFounder: !!(user as any).isFounder,
            founderNumber: (user as any).founderNumber ?? null,
          };
          if (user.companyId) {
            const [company] = await db.select().from(companies).where(eq(companies.id, user.companyId));
            context.locals.company = company ? {
              id: company.id,
              name: company.name,
              subscriptionTier: company.subscriptionTier || 'free',
            } : null;
          }
        }
      }
    } catch {
      // ignore — route stays public
    }
    const res = await next();
    return applyRequestId(applySecurityHeaders(res, pathname), requestId);
  }

  // Protected routes — validate session
  if (pathname.startsWith('/app') || pathname.startsWith('/api/') || pathname.startsWith('/admin')) {
    try {
      const cookieHeader = context.request.headers.get('cookie');
      const result = await getSession(cookieHeader);

      if (!result) {
        if (pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({ error: 'Neautorizat' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return context.redirect('/auth/login');
      }

      const { user } = result;
      const isAdmin = (user as any).isAdmin === true || user.userType === 'admin';
      context.locals.user = {
        id: user.id,
        platformId: user.platformId,
        email: user.email,
        name: user.name,
        userType: user.userType as any,
        companyId: user.companyId || null,
        parentUserId: user.parentUserId || null,
        isSubUser: !!user.parentUserId,
        isAdmin,
        avatarUrl: user.avatarUrl || null,
        phone: user.phone || null,
        onboardingSeenAt: (user as any).onboardingSeenAt ?? null,
        isFounder: !!(user as any).isFounder,
        founderNumber: (user as any).founderNumber ?? null,
      };

      // Load company data
      context.locals.license = null;
      if (user.companyId) {
        const [company] = await db.select().from(companies).where(eq(companies.id, user.companyId));
        context.locals.company = company ? {
          id: company.id,
          name: company.name,
          subscriptionTier: company.subscriptionTier || 'free',
          role: user.parentUserId ? 'operator' : 'owner',
        } : null;

        // License / paywall gate (only for /app page navigations).
        if (pathname.startsWith('/app')) {
          try {
            const st = await licenseState(user.companyId);
            context.locals.license = { plan: st.plan, status: st.status, active: st.active, trialDaysLeft: st.trialDaysLeft };
            const exempt = pathname.startsWith('/app/setari/abonament') || pathname === '/app/logout';
            if (!st.active && !exempt && !isAdmin) {
              return context.redirect('/app/setari/abonament');
            }
          } catch { /* DB not ready — don't lock out */ }
        }
      } else {
        context.locals.company = null;
      }

      // Admin guard
      if (pathname.startsWith('/admin')) {
        const isAdmin = (user as any).isAdmin || user.userType === 'admin';
        if (!isAdmin) {
          if (pathname.startsWith('/api/admin')) {
            return new Response(JSON.stringify({ error: 'Acces interzis' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          return context.redirect('/app');
        }
      }
    } catch (err) {
      await captureError(err, { route: pathname, method });
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Eroare de autentificare' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return context.redirect('/auth/login');
    }
  }

  try {
    const res = await next();
    return applyRequestId(applySecurityHeaders(res, pathname), requestId);
  } catch (err) {
    await captureError(err, { route: pathname, method, userId: context.locals.user?.id });
    throw err;
  }
});
