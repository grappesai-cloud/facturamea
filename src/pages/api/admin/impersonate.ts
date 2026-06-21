import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { createSession, setSessionCookie } from '../../../lib/auth';
import { logAction } from '../../../lib/audit';

function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

// Start impersonating a user: swap the session to the target, and remember the
// admin in a separate `th_imp` cookie so they can return (see stop-impersonate).
export const POST: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Date invalide' }), { status: 400 }); }
  const userId = String(body.userId || '').trim();
  if (!userId) return new Response(JSON.stringify({ error: 'userId lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return new Response(JSON.stringify({ error: 'Utilizator inexistent' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const adminId = (locals.user as any).id;
  const sessionId = await createSession(target.id);
  const isProd = (import.meta.env.PROD ?? process.env.NODE_ENV === 'production');
  const secure = isProd ? '; Secure' : '';

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', setSessionCookie(sessionId));
  headers.append('Set-Cookie', `th_imp=${adminId}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=3600`);
  try { await logAction({ userId: adminId, companyId: target.companyId, action: 'admin.impersonate_start', entityType: 'user', entityId: target.id, request }); } catch {}

  return new Response(JSON.stringify({ ok: true }), { headers });
};
