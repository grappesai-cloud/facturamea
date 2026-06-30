import type { APIRoute } from 'astro';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { verifyImp } from '../../../lib/imp-cookie';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';

// End impersonation: restore the admin session from the `th_imp` cookie.
//
// This MUST be POST-only. It swaps the live session cookie, so exposing it on GET
// let link prefetch (Astro fires GET on hover with ClientRouter, browsers also
// speculatively prefetch) silently end impersonation after a few page views —
// the admin would land back on their own empty account "with no data". POST is
// never prefetched/speculatively fetched, so only a real form submit triggers it.
// A stray GET just redirects, doing nothing.
export const POST: APIRoute = async ({ request }) => {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)th_imp=([^;]+)/);
  // Verify the HMAC signature — a forged/plaintext cookie yields null and is rejected.
  const adminId = m ? (verifyImp(decodeURIComponent(m[1])) || '') : '';

  const isProd = (import.meta.env.PROD ?? process.env.NODE_ENV === 'production');
  const secure = isProd ? '; Secure' : '';
  const clearImp = `th_imp=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;

  if (!adminId) return new Response(null, { status: 302, headers: { Location: '/app' } });

  const [admin] = await db.select().from(users).where(eq(users.id, adminId));
  if (!admin || (!(admin as any).isAdmin && admin.userType !== 'admin')) {
    return new Response(null, { status: 302, headers: { Location: '/app', 'Set-Cookie': clearImp } });
  }

  const sessionId = await createSession(admin.id);
  const headers = new Headers({ Location: '/admin' });
  headers.append('Set-Cookie', setSessionCookie(sessionId));
  headers.append('Set-Cookie', clearImp);
  try { await logAction({ userId: admin.id, action: 'admin.impersonate_stop', request }); } catch {}
  return new Response(null, { status: 302, headers });
};

// A GET here (prefetch, speculative fetch, bookmark) must NEVER swap the session —
// just bounce to the app. Exiting impersonation goes through the POST form banner.
export const GET: APIRoute = async () =>
  new Response(null, { status: 302, headers: { Location: '/app' } });
