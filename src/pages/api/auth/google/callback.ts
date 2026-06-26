import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { googleExchange, appOrigin } from '../../../../lib/oauth';
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

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(request.headers.get('cookie'), 'fm_g_state');

  if (!code || !state || !cookieState || state !== cookieState) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_state' } });
  }

  try {
    const origin = appOrigin(request.url);
    const profile = await googleExchange(origin, code);
    const { userId, companyId, totpEnabled } = await findOrCreateOAuthUser({ ...profile, provider: 'google' });

    const feRaw = readCookie(request.headers.get('cookie'), 'fm_oauth_fe');
    const feRedirect = feRaw && isAllowedFeRedirect(decodeURIComponent(feRaw)) ? decodeURIComponent(feRaw) : null;

    // 2FA gate: mirror the password-login path. Don't create a full session;
    // issue a short-lived pending handle and send the user to the 2FA step.
    if (totpEnabled) {
      const handle = nanoid(32);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.insert(totpPendingLogins).values({ id: handle, userId, expiresAt } as any);
      try { await logAction({ userId, companyId, action: 'auth.oauth_google_totp_pending', request }); } catch {}
      const headers = new Headers({ Location: `/auth/2fa?handle=${handle}` });
      headers.append('Set-Cookie', 'fm_g_state=; Path=/; HttpOnly; Max-Age=0');
      headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; Max-Age=0');
      return new Response(null, { status: 302, headers });
    }

    // Native app: hand a signed token back via the custom scheme; the real
    // session is created when the app exchanges it inside the WKWebView.
    if (readCookie(request.headers.get('cookie'), 'fm_oauth_native') === '1') {
      const { signNativeAuth, NATIVE_SCHEME } = await import('../../../../lib/native-auth');
      try { await logAction({ userId, companyId, action: 'auth.oauth_google_native', request }); } catch {}
      const h = new Headers({ Location: `${NATIVE_SCHEME}://auth?token=${encodeURIComponent(signNativeAuth(userId))}` });
      h.append('Set-Cookie', 'fm_g_state=; Path=/; HttpOnly; Max-Age=0');
      h.append('Set-Cookie', 'fm_oauth_native=; Path=/; HttpOnly; Max-Age=0');
      h.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; Max-Age=0');
      return new Response(null, { status: 302, headers: h });
    }

    const sessionId = await createSession(userId);
    try { await logAction({ userId, companyId, action: 'auth.oauth_google', request }); } catch {}
    // Prefer a server-side session cookie over leaking the token in a URL
    // fragment. The cookie is set on the redirect Response; the FE lands
    // authenticated without ever seeing the raw token in the URL.
    const headers = new Headers({ Location: feRedirect || '/app' });
    headers.append('Set-Cookie', setSessionCookie(sessionId));
    headers.append('Set-Cookie', 'fm_g_state=; Path=/; HttpOnly; Max-Age=0');
    headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_failed' } });
  }
};
