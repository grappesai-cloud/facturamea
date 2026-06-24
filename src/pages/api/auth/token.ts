// Token auth for the decoupled frontend / Capacitor app.
//   POST  { email, password } -> { token, user, company }   (token = session id, send as `Authorization: Bearer <token>`)
//   DELETE (Bearer)            -> revoke the current token
// Mirrors the secure cookie-login branch in [...all].ts: Turnstile + account
// lockout + mandatory email verification + 2FA + active-account check.
import type { APIRoute } from 'astro';
import { getSessionFromRequest, deleteSessionByRawToken, createSession, verifyAndMaybeRehash } from '../../../lib/auth';
import { db } from '../../../db';
import { users, companies, sessions, userCompanyMemberships, totpPendingLogins } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { normalizeRole } from '../../../lib/permissions-roles';
import { getClientIp, checkLoginLockoutAsync, recordFailedLoginAsync, clearLoginAttemptsAsync } from '../../../lib/security';
import { verifyTurnstile } from '../../../lib/turnstile';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch {}
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'Email și parolă obligatorii' }, 400);

  const clientIp = getClientIp(request);
  // Anti-bot (no-op until TURNSTILE_SECRET is set; then required).
  const ts = await verifyTurnstile(body.turnstileToken || '', clientIp);
  if (!ts.ok) return json({ error: 'Verificare anti-bot eșuată. Reîncarcă și încearcă din nou.' }, 403);

  // Per-account lockout (defends credential stuffing on top of the IP throttle).
  const lockout = await checkLoginLockoutAsync(email);
  if (lockout.locked) return json({ error: `Cont blocat temporar. Încearcă din nou în ${lockout.minutesRemaining} minute.` }, 423);

  try {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    if (!u) throw new Error('invalid');
    if (u.isActive === false || u.deletedAt) throw new Error('invalid');
    const verify = await verifyAndMaybeRehash(password, u.hashedPassword);
    if (!verify.valid) throw new Error('invalid');
    if (verify.newHash) { try { await db.update(users).set({ hashedPassword: verify.newHash } as any).where(eq(users.id, u.id)); } catch {} }

    await clearLoginAttemptsAsync(email);

    // Mandatory email verification — block + auto-resend the confirmation link.
    if (!u.emailVerified) {
      try {
        const { createAndSendVerification } = await import('../../../lib/email-verification');
        await createAndSendVerification(u.id, u.email, new URL(request.url).origin);
      } catch (e) { console.warn('resend verification at token-login failed', e); }
      return json({ error: 'Confirmă-ți adresa de email. Ți-am retrimis linkul de confirmare.' }, 403);
    }

    // 2FA: hand out a short-lived pending handle instead of a token.
    if ((u as any).totpEnabled) {
      const handle = nanoid(32);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.insert(totpPendingLogins).values({ id: handle, userId: u.id, expiresAt } as any);
      return json({ requireTotp: true, handle }, 200);
    }

    const sessionId = await createSession(u.id);
    let company: any = null;
    if (u.companyId) {
      const [c] = await db.select().from(companies).where(eq(companies.id, u.companyId));
      if (c) {
        let role = u.parentUserId ? 'operator' : 'owner';
        try {
          const [m] = await db.select({ role: userCompanyMemberships.role })
            .from(userCompanyMemberships)
            .where(and(eq(userCompanyMemberships.userId, u.id), eq(userCompanyMemberships.companyId, u.companyId)));
          if (m) role = normalizeRole(m.role);
        } catch {}
        company = { id: c.id, name: c.name, cui: c.cui, role };
      }
    }
    return json({
      token: sessionId,
      user: { id: u.id, name: u.name, email: u.email, platformId: u.platformId, isAdmin: (u as any).isAdmin === true || u.userType === 'admin' },
      company,
    }, 200);
  } catch {
    await recordFailedLoginAsync(email);
    return json({ error: 'Email sau parolă incorectă' }, 401);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const result = await getSessionFromRequest(request);
  if (result) {
    try { await db.delete(sessions).where(eq(sessions.id, result.session.id)); } catch {}
  }
  return json({ ok: true }, 200);
};
