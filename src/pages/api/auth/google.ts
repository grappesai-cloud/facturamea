import type { APIRoute } from 'astro';
import { googleConfigured, googleAuthUrl, appOrigin, randomState } from '../../../lib/oauth';
import { isAllowedFeRedirect } from '../../../lib/fe-origins';

export const GET: APIRoute = async ({ request, url }) => {
  if (!googleConfigured()) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_unconfigured' } });
  }
  const origin = appOrigin(request.url);
  const state = randomState();
  const headers = new Headers({ Location: googleAuthUrl(origin, state) });
  const secure = origin.startsWith('https') ? '; Secure' : '';
  headers.append('Set-Cookie', `fm_g_state=${state}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=600`);
  // Decoupled-frontend flow: ?redirect=<FE>/auth/callback → after auth we hand
  // the token back to the FE instead of setting a cookie + going to /app.
  const redirect = url.searchParams.get('redirect');
  if (isAllowedFeRedirect(redirect)) {
    headers.append('Set-Cookie', `fm_oauth_fe=${encodeURIComponent(redirect!)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=600`);
  }
  return new Response(null, { status: 302, headers });
};
