// POST /api/push/register-device  { token, platform }
// Stores a native APNs/FCM device token for the logged-in user (Capacitor app).
// Upsert on the token so re-registration just refreshes ownership + lastSeenAt.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { deviceTokens } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautentificat' }, 401);
  const body = await request.json().catch(() => ({})) as { token?: string; platform?: string };
  const token = String(body.token || '').trim();
  const platform = body.platform === 'android' ? 'android' : body.platform === 'ios' ? 'ios' : null;
  if (!token || !platform) return json({ error: 'token + platform (ios|android) obligatorii' }, 400);

  try {
    await db.insert(deviceTokens).values({
      id: nanoid(),
      userId: locals.user.id,
      companyId: locals.user.companyId || null,
      platform,
      token,
    }).onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId: locals.user.id, companyId: locals.user.companyId || null, platform, lastSeenAt: new Date() },
    });
    return json({ ok: true });
  } catch {
    // DB not provisioned / transient — don't surface to the app.
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
