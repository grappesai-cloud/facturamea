import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyTotp } from '../../../../lib/totp';
import { logAction } from '../../../../lib/audit';

// Step 2 of enrollment. User scans the QR, types the 6-digit code from their
// app. We verify against the secret stored at /enroll. On success we set
// totp_enabled = true and totp_enrolled_at = now.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return new Response(JSON.stringify({ error: 'Codul trebuie să aibă 6 cifre' }), { status: 400 });
  }

  const [u] = await db.select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
    .from(users).where(eq(users.id, locals.user.id));
  if (!u?.totpSecret) {
    return new Response(JSON.stringify({ error: 'Nu ai un setup în curs. Începe de la pasul de înregistrare.' }), { status: 400 });
  }
  if (u.totpEnabled) {
    return new Response(JSON.stringify({ error: '2FA este deja activat' }), { status: 400 });
  }

  if (!verifyTotp(u.totpSecret, code)) {
    return new Response(JSON.stringify({ error: 'Cod incorect. Verifică ora telefonului şi încearcă din nou.' }), { status: 400 });
  }

  await db.update(users)
    .set({ totpEnabled: true, totpEnrolledAt: new Date() })
    .where(eq(users.id, locals.user.id));

  await logAction({
    userId: locals.user.id, companyId: locals.user.companyId,
    action: 'auth.totp_enabled', entityType: 'user', entityId: locals.user.id, request,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
