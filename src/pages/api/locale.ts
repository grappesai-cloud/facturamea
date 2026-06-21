import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const locale = url.searchParams.get('l') === 'en' ? 'en' : 'ro';
  cookies.set('th-locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: false,
  });
  // Open-redirect guard: only follow same-origin relative paths. A safe target
  // starts with a single '/' (not '//', which is protocol-relative) and has no
  // URL scheme. Anything else falls back to the homepage.
  const to = url.searchParams.get('to') || '';
  const safe = to.startsWith('/') && !to.startsWith('//') && !/^\/\\/.test(to) && !/^[a-z][a-z0-9+.-]*:/i.test(to)
    ? to
    : '/';
  return redirect(safe, 302);
};
