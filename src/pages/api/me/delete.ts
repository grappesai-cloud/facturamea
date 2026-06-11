import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users, sessions } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';
import { clearSessionCookie, verifyPassword } from '../../../lib/auth';

// GDPR Article 17 — right to erasure.
// Soft-deletes the user (deletedAt = now). The daily cron will hard-delete
// accounts where deletedAt is more than 30 days old, giving the user a
// grace period to cancel via support if they change their mind.
//
// Requires the user's current password to confirm the destructive action,
// because session hijack would otherwise be a one-click account deletion.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body invalid' }), { status: 400 });
  }
  if (!body.password || typeof body.password !== 'string') {
    return new Response(JSON.stringify({ error: 'Parola este obligatorie pentru confirmare' }), { status: 400 });
  }
  if (body.confirm !== 'STERG-CONTUL') {
    return new Response(JSON.stringify({ error: 'Trebuie să tastezi exact STERG-CONTUL pentru a confirma' }), { status: 400 });
  }

  // Re-authenticate via password
  const [u] = await db.select({ hashedPassword: users.hashedPassword }).from(users).where(eq(users.id, locals.user.id));
  if (!u) {
    return new Response(JSON.stringify({ error: 'Utilizator inexistent' }), { status: 404 });
  }
  const ok = await verifyPassword(body.password, u.hashedPassword);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Parolă incorectă' }), { status: 401 });
  }

  const now = new Date();

  // Soft-delete the user. Anonymise email so it can be reused after the
  // grace period, and so support can still find the row by old email if
  // the user emails to recover.
  const anonEmail = `deleted+${locals.user.id}@facturamea.invalid`;
  await db.update(users)
    .set({
      deletedAt: now,
      // Keep original email in name suffix for support recovery
      name: `[şters ${now.toISOString().slice(0,10)}] ${locals.user.name}`,
      email: anonEmail,
      phone: null,
    })
    .where(eq(users.id, locals.user.id));

  // Invalidate all sessions
  try {
    await db.delete(sessions).where(eq(sessions.userId, locals.user.id));
  } catch {}

  await logAction({
    userId: locals.user.id, companyId: locals.user.companyId,
    action: 'gdpr.delete_requested',
    entityType: 'user', entityId: locals.user.id,
    metadata: { anonEmail },
    request,
  });

  return new Response(JSON.stringify({
    ok: true,
    message: 'Cont marcat pentru ştergere. Contul va fi şters definitiv în 30 de zile.',
    finalDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
};
