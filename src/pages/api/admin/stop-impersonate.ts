import type { APIRoute } from 'astro';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { verifyImp } from '../../../lib/imp-cookie';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';

// End impersonation: restore the admin session from the `th_imp` cookie.
// No admin check needed — the th_imp cookie is HttpOnly and only set by the
// admin-initiated impersonate endpoint; we still re-verify the admin flag.
export const GET: APIRoute = async ({ request }) => {
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
