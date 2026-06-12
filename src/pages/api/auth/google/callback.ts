import type { APIRoute } from 'astro';
import { googleExchange, appOrigin } from '../../../../lib/oauth';
import { findOrCreateOAuthUser, setSessionCookie } from '../../../../lib/auth';
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
    const { sessionId, userId, companyId } = await findOrCreateOAuthUser({ ...profile, provider: 'google' });
    try { await logAction({ userId, companyId, action: 'auth.oauth_google', request }); } catch {}
    // Decoupled-frontend handoff: hand the token to the FE via URL fragment.
    const feRaw = readCookie(request.headers.get('cookie'), 'fm_oauth_fe');
    const feRedirect = feRaw ? decodeURIComponent(feRaw) : null;
    if (feRedirect && isAllowedFeRedirect(feRedirect)) {
      const headers = new Headers({ Location: `${feRedirect}#token=${sessionId}` });
      headers.append('Set-Cookie', 'fm_g_state=; Path=/; HttpOnly; Max-Age=0');
      headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; Max-Age=0');
      return new Response(null, { status: 302, headers });
    }
    const headers = new Headers({ Location: '/app' });
    headers.append('Set-Cookie', setSessionCookie(sessionId));
    headers.append('Set-Cookie', 'fm_g_state=; Path=/; HttpOnly; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_failed' } });
  }
};
