import type { APIRoute } from 'astro';
import { appleExchange, appOrigin } from '../../../../lib/oauth';
import { findOrCreateOAuthUser, setSessionCookie } from '../../../../lib/auth';
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
    const { sessionId, userId, companyId } = await findOrCreateOAuthUser({ email: finalEmail, name, provider: 'apple' });
    try { await logAction({ userId, companyId, action: 'auth.oauth_apple', request }); } catch {}
    const feRaw = readCookie(request.headers.get('cookie'), 'fm_oauth_fe');
    const feRedirect = feRaw ? decodeURIComponent(feRaw) : null;
    if (feRedirect && isAllowedFeRedirect(feRedirect)) {
      const headers = new Headers({ Location: `${feRedirect}#token=${sessionId}` });
      headers.append('Set-Cookie', 'fm_a_state=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
      headers.append('Set-Cookie', 'fm_oauth_fe=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
      return new Response(null, { status: 302, headers });
    }
    const headers = new Headers({ Location: '/app' });
    headers.append('Set-Cookie', setSessionCookie(sessionId));
    headers.append('Set-Cookie', 'fm_a_state=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_failed' } });
  }
};
