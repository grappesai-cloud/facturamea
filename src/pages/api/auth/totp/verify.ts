import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users, totpPendingLogins } from '../../../../db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { createSession, setSessionCookie } from '../../../../lib/auth';
import { verifyTotp, consumeRecoveryCode, hashRecoveryCodes, openTotpSecret } from '../../../../lib/totp';
import { logAction } from '../../../../lib/audit';
import { rateLimitAsync, getClientIp } from '../../../../lib/security';

// Step 2 of login when TOTP is enabled. Client sends the handle from the
// password step + a 6-digit TOTP code OR an 8-char recovery code.
// On success: full session is created and the pending row is deleted.
export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`totp_verify:${ip}`, 10, 5 * 60 * 1000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Prea multe încercări. Aşteaptă câteva minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  const handle = String(body.handle || '');
  const code = String(body.code || '').replace(/\s+/g, '');
  const recoveryCode = String(body.recoveryCode || '').replace(/\s+/g, '').toUpperCase();

  if (!handle || (!code && !recoveryCode)) {
    return new Response(JSON.stringify({ error: 'Handle şi cod (sau cod de recuperare) sunt obligatorii' }), { status: 400 });
  }

  const now = new Date();
  const [pending] = await db.select()
    .from(totpPendingLogins)
    .where(and(eq(totpPendingLogins.id, handle), gt(totpPendingLogins.expiresAt, now)))
    .limit(1);

  if (!pending) {
    return new Response(JSON.stringify({ error: 'Sesiune expirată. Re-autentifică-te.' }), { status: 401 });
  }

  const [u] = await db.select().from(users).where(eq(users.id, pending.userId));
  if (!u || !u.totpEnabled || !u.totpSecret) {
    return new Response(JSON.stringify({ error: 'Cont fără 2FA configurat' }), { status: 400 });
  }

  let ok = false;
  let usedRecovery = false;

  if (code && verifyTotp(openTotpSecret(u.totpSecret), code)) {
    ok = true;
  } else if (recoveryCode && u.totpRecoveryCodes) {
    let hashes: string[] = [];
    try { hashes = JSON.parse(u.totpRecoveryCodes); } catch {}
    const idx = await consumeRecoveryCode(recoveryCode, hashes);
    if (idx >= 0) {
      ok = true;
      usedRecovery = true;
      // Remove the consumed code so it can't be reused
      hashes.splice(idx, 1);
      await db.update(users)
        .set({ totpRecoveryCodes: JSON.stringify(hashes) })
        .where(eq(users.id, u.id));
    }
  }

  if (!ok) {
    return new Response(JSON.stringify({ error: 'Cod incorect' }), { status: 401 });
  }

  // Consume the pending login handle (one-time use)
  await db.delete(totpPendingLogins).where(eq(totpPendingLogins.id, handle));

  const sessionId = await createSession(u.id);
  await logAction({
    userId: u.id, companyId: u.companyId,
    action: usedRecovery ? 'auth.login_totp_recovery' : 'auth.login_totp',
    request,
  });

  // `token` lets Bearer/Capacitor clients (which can't use the cookie) complete
  // 2FA login; web clients ignore it and rely on the Set-Cookie.
  return new Response(JSON.stringify({ success: true, token: sessionId, usedRecovery, recoveryCodesRemaining: usedRecovery ? (u.totpRecoveryCodes ? JSON.parse(u.totpRecoveryCodes).length - 1 : 0) : null }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(sessionId),
    },
  });
};
