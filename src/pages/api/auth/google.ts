import type { APIRoute } from 'astro';
import { googleConfigured, googleAuthUrl, appOrigin, randomState } from '../../../lib/oauth';

export const GET: APIRoute = async ({ request }) => {
  if (!googleConfigured()) {
    return new Response(null, { status: 302, headers: { Location: '/auth/login?error=oauth_unconfigured' } });
  }
  const origin = appOrigin(request.url);
  const state = randomState();
  const headers = new Headers({ Location: googleAuthUrl(origin, state) });
  const secure = origin.startsWith('https') ? '; Secure' : '';
  headers.append('Set-Cookie', `fm_g_state=${state}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=600`);
  return new Response(null, { status: 302, headers });
};
