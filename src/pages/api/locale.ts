import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url, request, cookies, redirect }) => {
  const locale = url.searchParams.get('l') === 'en' ? 'en' : 'ro';
  cookies.set('th-locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });
  const ref = url.searchParams.get('to') || request.headers.get('referer') || '/';
  return redirect(ref, 302);
};
