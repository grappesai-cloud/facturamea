// Token auth for the decoupled frontend.
//   POST  { email, password } -> { token, user, company }   (token = session id, send as `Authorization: Bearer <token>`)
//   DELETE (Bearer)            -> revoke the current token
import type { APIRoute } from 'astro';
import { loginUser, getSessionFromRequest } from '../../../lib/auth';
import { db } from '../../../db';
import { companies, sessions } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email și parolă obligatorii' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const { user, sessionId } = await loginUser(email, password);
    let company: any = null;
    if (user.companyId) {
      const [c] = await db.select().from(companies).where(eq(companies.id, user.companyId));
      if (c) company = { id: c.id, name: c.name, cui: c.cui, role: user.parentUserId ? 'operator' : 'owner' };
    }
    return new Response(JSON.stringify({
      token: sessionId,
      user: { id: user.id, name: user.name, email: user.email, platformId: user.platformId, isAdmin: (user as any).isAdmin === true || user.userType === 'admin' },
      company,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Email sau parolă incorectă' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const result = await getSessionFromRequest(request);
  if (result) {
    try { await db.delete(sessions).where(eq(sessions.id, result.session.id)); } catch {}
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
