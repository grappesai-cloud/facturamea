// Token auth for the decoupled frontend.
//   POST  { email, password } -> { token, user, company }   (token = session id, send as `Authorization: Bearer <token>`)
//   DELETE (Bearer)            -> revoke the current token
import type { APIRoute } from 'astro';
import { loginUser, getSessionFromRequest, deleteSessionByRawToken } from '../../../lib/auth';
import { db } from '../../../db';
import { companies, sessions, userCompanyMemberships, totpPendingLogins } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { normalizeRole } from '../../../lib/permissions-roles';

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
    // 2FA: don't hand out a session token before the second factor. loginUser
    // already minted a session — revoke it and return a pending handle instead.
    if ((user as any).totpEnabled) {
      await deleteSessionByRawToken(sessionId).catch(() => {});
      const handle = nanoid(32);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.insert(totpPendingLogins).values({ id: handle, userId: user.id, expiresAt } as any);
      return new Response(JSON.stringify({ requireTotp: true, handle }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    let company: any = null;
    if (user.companyId) {
      const [c] = await db.select().from(companies).where(eq(companies.id, user.companyId));
      if (c) {
        let role = user.parentUserId ? 'operator' : 'owner';
        try {
          const [m] = await db.select({ role: userCompanyMemberships.role })
            .from(userCompanyMemberships)
            .where(and(eq(userCompanyMemberships.userId, user.id), eq(userCompanyMemberships.companyId, user.companyId)));
          if (m) role = normalizeRole(m.role);
        } catch {}
        company = { id: c.id, name: c.name, cui: c.cui, role };
      }
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
