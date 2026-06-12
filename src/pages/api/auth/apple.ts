import type { APIRoute } from 'astro';
import { appleConfigured, appleAuthUrl, appOrigin, randomState } from '../../../lib/oauth';
import { isAllowedFeRedirect } from '../../../lib/fe-origins';

export const GET: APIRoute = async ({ request, url }) => {
  if (!appleConfigured()) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_unconfigured' } });
  }
  const origin = appOrigin(request.url);
  const state = randomState();
  const headers = new Headers({ Location: appleAuthUrl(origin, state) });
  // Apple posts the callback cross-site (form_post) → cookies must be SameSite=None; Secure.
  headers.append('Set-Cookie', `fm_a_state=${state}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=600`);
  const redirect = url.searchParams.get('redirect');
  if (isAllowedFeRedirect(redirect)) {
    headers.append('Set-Cookie', `fm_oauth_fe=${encodeURIComponent(redirect!)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=600`);
  }
  return new Response(null, { status: 302, headers });
};
