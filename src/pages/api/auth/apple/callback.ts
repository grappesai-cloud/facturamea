import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { appleExchange, appOrigin } from '../../../../lib/oauth';
import { findOrCreateOAuthUser, createSession, setSessionCookie } from '../../../../lib/auth';
import { db } from '../../../../db';
import { totpPendingLogins } from '../../../../db/schema';
import { logAction } from '../../../../lib/audit';
import { isAllowedFeRedirect } from '../../../../lib/fe-origins';

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const m = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}

// Apple uses response_mode=form_post → the callback is an x-www-form-urlencoded POST.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const code = form.get('code')?.toString();
  const state = form.get('state')?.toString();
  const cookieState = readCookie(request.headers.get('cookie'), 'fm_a_state');
  // `user` is only present on the very first authorization.
  let name: string | undefined;
  try {
    const userRaw = form.get('user')?.toString();
    if (userRaw) {
      const u = JSON.parse(userRaw);
      name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(' ') || undefined;
    }
  } catch {}

  if (!code || !state || !cookieState || state !== cookieState) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_state' } });
  }

  try {
    const origin = appOrigin(request.url);
    const { email, sub } = await appleExchange(origin, code);
    const finalEmail = email || `${sub}@privaterelay.appleid.com`;
    const { userId, companyId, totpEnabled } = await findOrCreateOAuthUser({ email: finalEmail, name, provider: 'apple' });

    const feRaw = readCookie(request.headers.get('cookie'), 'fm_oauth_fe');
    const feRedirect = feRaw && isAllowedFeRedirect(decodeURIComponent(feRaw)) ? decodeURIComponent(feRaw) : null;

    // 2FA gate: mirror the password-login path — pending handle, no full session.
    if (totpEnabled) {
      const handle = nanoid(32);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.insert(totpPendingLogins).values({ id: handle, userId, expiresAt } as any);
      try { await logAction({ userId, companyId, action: 'auth.oauth_apple_totp_pending', request }); } catch {}
      const headers = new Headers({ Location: `/auth/2fa?handle=${handle}` });
      headers.append('Set-Cookie', 'fm_a_state=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
      headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
      return new Response(null, { status: 302, headers });
    }

    const sessionId = await createSession(userId);
    try { await logAction({ userId, companyId, action: 'auth.oauth_apple', request }); } catch {}
    // Prefer a server-side session cookie over a URL-fragment token handoff.
    const headers = new Headers({ Location: feRedirect || '/app' });
    headers.append('Set-Cookie', setSessionCookie(sessionId));
    headers.append('Set-Cookie', 'fm_a_state=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
    headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_failed' } });
  }
};
