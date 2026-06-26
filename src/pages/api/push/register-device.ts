// POST /api/push/register-device  { token, platform }
// Stores a native APNs/FCM device token for the logged-in user (Capacitor app).
// Upsert on the token so re-registration just refreshes ownership + lastSeenAt.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { deviceTokens } from '../../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Self-bootstrap the table so native push works without a separate migration
// step (additive, idempotent DDL — runs only when the first insert finds it missing).
async function ensureTable(): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS device_tokens (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id text,
    platform varchar(12) NOT NULL,
    token text NOT NULL,
    created_at timestamp DEFAULT now(),
    last_seen_at timestamp DEFAULT now()
  )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_device_token ON device_tokens (token)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id)`);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautentificat' }, 401);
  const body = await request.json().catch(() => ({})) as { token?: string; platform?: string };
  const token = String(body.token || '').trim();
  const platform = body.platform === 'android' ? 'android' : body.platform === 'ios' ? 'ios' : null;
  if (!token || !platform) return json({ error: 'token + platform (ios|android) obligatorii' }, 400);

  const row = {
    userId: locals.user.id,
    companyId: locals.user.companyId || null,
    platform,
  };
  const upsert = () => db.insert(deviceTokens).values({ id: nanoid(), token, ...row }).onConflictDoUpdate({
    target: deviceTokens.token,
    set: { ...row, lastSeenAt: new Date() },
  });
  try {
    await upsert();
    return json({ ok: true });
  } catch (err) {
    // First call may hit a missing table — create it once, then retry.
    if (/relation .*device_tokens.* does not exist|no such table/i.test(String((err as any)?.message || err))) {
      try { await ensureTable(); await upsert(); return json({ ok: true, created: true }); } catch { /* fall through */ }
    }
    return json({ ok: false }, 200);
  }
};

// DELETE — unregister (on logout). Best-effort.
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautentificat' }, 401);
  const body = await request.json().catch(() => ({})) as { token?: string };
  const token = String(body.token || '').trim();
  if (!token) return json({ error: 'token obligatoriu' }, 400);
  try { await db.delete(deviceTokens).where(eq(deviceTokens.token, token)); } catch {}
  return json({ ok: true });
};
