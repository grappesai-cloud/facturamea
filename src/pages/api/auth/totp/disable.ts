import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyTotp } from '../../../../lib/totp';
import { verifyPassword } from '../../../../lib/auth';
import { logAction } from '../../../../lib/audit';

// Disabling 2FA requires either the current TOTP code OR the user's password.
// Either is sufficient because we already proved possession of the session
// (locals.user) — the second factor here is just to prevent passive XSS or
// session-fixation exploitation of an account-altering action.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').replace(/\s+/g, '');
  const password = String(body.password || '');

  const [u] = await db.select({
    totpSecret: users.totpSecret,
    totpEnabled: users.totpEnabled,
    hashedPassword: users.hashedPassword,
  }).from(users).where(eq(users.id, locals.user.id));

  if (!u || !u.totpEnabled || !u.totpSecret) {
    return new Response(JSON.stringify({ error: '2FA nu este activat' }), { status: 400 });
  }

  let ok = false;
  if (code && verifyTotp(u.totpSecret, code)) ok = true;
  else if (password && await verifyPassword(password, u.hashedPassword)) ok = true;

  if (!ok) {
    return new Response(JSON.stringify({ error: 'Cod sau parolă incorectă' }), { status: 401 });
  }

  await db.update(users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
      totpEnrolledAt: null,
    })
    .where(eq(users.id, locals.user.id));

  await logAction({
    userId: locals.user.id, companyId: locals.user.companyId,
    action: 'auth.totp_disabled', entityType: 'user', entityId: locals.user.id, request,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
