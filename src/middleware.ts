import { defineMiddleware } from 'astro:middleware';
import { getSession, getSessionFromRequest } from './lib/auth';
import { db } from './db';
import { companies, userCompanyMemberships } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { normalizeRole } from './lib/permissions-roles';
import { getLocaleFromCookie } from './lib/i18n';
import { rateLimitAsync, getClientIp } from './lib/security';
import { captureError } from './lib/observability';
import { licenseState } from './lib/license';
import { isAnafConnected } from './lib/anaf/tokens';
import { isAllowedFeOrigin } from './lib/fe-origins';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Paid-feature paywall: mutating /api/* calls require an active lifetime license,
// EXCEPT these prefixes (auth, payment, account setup/management, webhooks, cron,
// public, notifications) which must work without a paid license. The /app pages
// are gated separately (redirect to onboarding). v1 API is gated in requireApiKey.
const API_PAYWALL_EXEMPT = [
  '/api/auth/', '/api/checkout', '/api/webhooks/', '/api/cron/', '/api/public/',
  '/api/blog/', '/api/locale', '/api/demo', '/api/onboarding/', '/api/companies/',
  '/api/me/', '/api/admin/', '/api/settings/', '/api/notifications', '/api/push/',
];

// ─── CORS for the decoupled frontend (token Bearer auth) ────────────────
// Token-auth requests are not cookie-based, so CORS is safe. Allowlist lives
// in lib/fe-origins (shared with the OAuth token-handoff routes).
function corsHeadersFor(origin: string | null): Record<string, string> | null {
  if (!origin) return null;
  if (!isAllowedFeOrigin(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
function withCors(res: Response, cors: Record<string, string> | null): Response {
  if (!cors) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Resolve the user's real company role from the membership table. Falls back
// to owner (top-level user) / operator (sub-user) when no membership row exists.
async function resolveCompanyRole(userId: string, companyId: string, parentUserId: string | null): Promise<string> {
  try {
    const [row] = await db
      .select({ role: userCompanyMemberships.role })
      .from(userCompanyMemberships)
      .where(and(eq(userCompanyMemberships.userId, userId), eq(userCompanyMemberships.companyId, companyId)));
    if (row) return normalizeRole(row.role);
  } catch { /* membership table not ready — fall through to default */ }
  return parentUserId == null ? 'owner' : 'operator';
}

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

  // CORS for the decoupled frontend. Preflight is answered immediately; actual
  // /api responses get CORS headers appended at the end.
  const origin = context.request.headers.get('origin');
  const cors = pathname.startsWith('/api/') ? corsHeadersFor(origin) : null;
  const hasBearer = /^Bearer\s+/i.test(context.request.headers.get('authorization') || '');
  if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new Response(null, { status: 204, headers: cors || {} });
  }

  // CSRF: reject cross-origin mutating requests on /api/* (skip cron — Vercel cron has Bearer)
  if (
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/cron/') &&
    !pathname.startsWith('/api/webhooks/') &&
    !pathname.startsWith('/api/v1/') &&
    !pathname.startsWith('/api/auth/apple/callback') &&
    !pathname.startsWith('/api/auth/token') &&
    !hasBearer &&
    MUTATING_METHODS.has(method)
  ) {
    const host = context.request.headers.get('host');
    if (isCrossOrigin(context.request, host)) {
      return new Response(JSON.stringify({ error: 'Cerere refuzată (cross-origin)' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...(cors || {}) },
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
          ...(cors || {}),
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
    pathname.startsWith('/api/blog/') ||
    pathname === '/api/locale' ||
    pathname === '/api/demo' ||
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
      if (hasBearer || (cookieHeader && cookieHeader.includes('session='))) {
        const result = await getSessionFromRequest(context.request);
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
            const [company] = await db.select({
          id: companies.id, name: companies.name, subscriptionTier: companies.subscriptionTier,
          cui: companies.cui, address: companies.address,
        }).from(companies).where(eq(companies.id, user.companyId));
            context.locals.company = company ? {
              id: company.id,
              name: company.name,
              subscriptionTier: company.subscriptionTier || 'free',
              role: await resolveCompanyRole(user.id, user.companyId, user.parentUserId || null),
            } : null;
          }
        }
      }
    } catch {
      // ignore — route stays public
    }
    const res = await next();
    return withCors(applyRequestId(applySecurityHeaders(res, pathname), requestId), cors);
  }

  // Protected routes — validate session
  if (pathname.startsWith('/app') || pathname.startsWith('/api/') || pathname.startsWith('/admin')) {
    try {
      const result = await getSessionFromRequest(context.request);

      if (!result) {
        if (pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({ error: 'Neautorizat' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...(cors || {}) },
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
      context.locals.anafConnected = null;
      if (user.companyId) {
        const [company] = await db.select({
          id: companies.id, name: companies.name, subscriptionTier: companies.subscriptionTier,
          cui: companies.cui, address: companies.address,
        }).from(companies).where(eq(companies.id, user.companyId));
        context.locals.company = company ? {
          id: company.id,
          name: company.name,
          subscriptionTier: company.subscriptionTier || 'free',
          role: await resolveCompanyRole(user.id, user.companyId, user.parentUserId || null),
        } : null;

        // License / paywall gate. Enforced on /app page navigations AND on
        // mutating /api/* calls to paid features (so the API + Capacitor Bearer
        // path can't bypass the 700 RON paywall — a real revenue hole otherwise).
        const needsApiLicense = pathname.startsWith('/api/')
          && MUTATING_METHODS.has(method)
          && !API_PAYWALL_EXEMPT.some((p) => pathname.startsWith(p));
        if (pathname.startsWith('/app') || needsApiLicense) {
          try {
            const st = await licenseState(user.companyId);
            context.locals.license = { plan: st.plan, status: st.status, active: st.active, trialDaysLeft: st.trialDaysLeft };
            // Activation: a company needs a complete fiscal profile (CIF + address)
            // AND a paid lifetime license. No trial.
            const companyComplete = !!(company && company.cui && company.address);
            if ((!companyComplete || !st.active) && !isAdmin) {
              if (needsApiLicense) {
                return new Response(JSON.stringify({ error: 'Licență inactivă. Activează abonamentul pentru a folosi această funcție.', code: 'license_inactive' }), {
                  status: 402, headers: { 'Content-Type': 'application/json', ...(cors || {}) },
                });
              }
              const exempt = pathname.startsWith('/app/onboarding')
                || pathname.startsWith('/app/setari/abonament')
                || pathname === '/app/logout';
              if (!exempt) return context.redirect('/app/onboarding');
            }
          } catch { /* DB not ready — don't lock out */ }
        }
        if (pathname.startsWith('/app')) {
          try { context.locals.anafConnected = await isAnafConnected(user.companyId); } catch {}
        }
      } else {
        context.locals.company = null;
      }

      // Impersonation flag (th_imp cookie set by /api/admin/impersonate) — powers
      // the "you're viewing as a user" banner + exit link.
      (context.locals as any).impersonating = /(?:^|;\s*)th_imp=/.test(context.request.headers.get('cookie') || '');

      // Admin guard (+ MANDATORY 2FA for admins). Covers both /admin pages and
      // /api/admin endpoints (the latter don't start with /admin). stop-impersonate
      // is exempt — it authenticates via the th_imp cookie while the live session
      // is the impersonated (non-admin) user.
      if ((pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) && pathname !== '/api/admin/stop-impersonate') {
        const isApi = pathname.startsWith('/api/admin');
        const isAdmin = (user as any).isAdmin || user.userType === 'admin';
        if (!isAdmin) {
          if (isApi) {
            return new Response(JSON.stringify({ error: 'Acces interzis' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...(cors || {}) },
            });
          }
          return context.redirect('/app');
        }
        // Admins must have two-factor enabled before touching anything in admin.
        if (!(user as any).totpEnabled) {
          if (isApi) {
            return new Response(JSON.stringify({ error: 'Activează autentificarea în doi pași (Setări → Securitate) pentru a folosi adminul.' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json', ...(cors || {}) },
            });
          }
          return context.redirect('/app/setari/securitate?2fa=admin');
        }
      }
    } catch (err) {
      await captureError(err, { route: pathname, method });
      if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Eroare de autentificare' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...(cors || {}) },
        });
      }
      return context.redirect('/auth/login');
    }
  }

  try {
    const res = await next();
    return withCors(applyRequestId(applySecurityHeaders(res, pathname), requestId), cors);
  } catch (err) {
    await captureError(err, { route: pathname, method, userId: context.locals.user?.id });
    throw err;
  }
});
