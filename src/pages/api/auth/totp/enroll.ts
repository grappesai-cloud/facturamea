import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { generateSecret, buildOtpAuthUrl, buildQrDataUrl, generateRecoveryCodes, hashRecoveryCodes, sealTotpSecret } from '../../../../lib/totp';

// Step 1 of enrollment. Generates a fresh secret + QR code + recovery codes.
// The secret is stored on the user row but totp_enabled stays false until
// the user POSTs to /api/auth/totp/confirm with a valid 6-digit code.
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  // If 2FA is already enabled, refuse to re-enroll — that would silently
  // overwrite the secret + recovery codes (a hijacked session could mint new
  // recovery codes and bypass the victim's authenticator). The user must
  // disable it first via /api/auth/totp/disable (which requires code/password).
  const [existing] = await db.select({ enabled: users.totpEnabled }).from(users).where(eq(users.id, locals.user.id));
  if (existing?.enabled) {
    return new Response(JSON.stringify({ error: '2FA este deja activat. Dezactivează-l întâi pentru a regenera codurile.' }), { status: 409 });
  }

  const secret = generateSecret();
  const otpAuthUrl = buildOtpAuthUrl(locals.user.email, secret);
  const qrDataUrl = await buildQrDataUrl(otpAuthUrl);
  const recoveryCodes = generateRecoveryCodes();
  const hashedRecovery = await hashRecoveryCodes(recoveryCodes);

  await db.update(users)
    .set({
      totpSecret: sealTotpSecret(secret),
      totpRecoveryCodes: JSON.stringify(hashedRecovery),
      // explicitly NOT setting totpEnabled — that happens after /confirm
    })
    .where(eq(users.id, locals.user.id));

  return new Response(JSON.stringify({
    secret,                // shown to user as fallback for manual entry
    otpAuthUrl,
    qrDataUrl,
    recoveryCodes,         // shown ONCE — user must store these
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
