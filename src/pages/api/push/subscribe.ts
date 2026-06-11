// POST /api/push/subscribe
//
// Body: { endpoint, keys: { p256dh, auth } } — the PushSubscription
// shape returned by PushManager.subscribe in the browser.
//
// Idempotent: re-subscribing the same endpoint updates the keys.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { pushSubscriptions } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  endpoint: z.string().url().min(20),
  keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(10) }),
});

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON invalid' }), { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Subscriere invalidă' }), { status: 400 });
  }
  const { endpoint, keys } = parsed.data;
  const ua = request.headers.get('user-agent') || null;

  const [existing] = await db
    .select({ endpoint: pushSubscriptions.endpoint })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));

  if (existing) {
    await db
      .update(pushSubscriptions)
      .set({
        userId: locals.user.id,
        p256dh: keys.p256dh,
        authKey: keys.auth,
        userAgent: ua,
        consecutiveFailures: 0,
        lastError: null,
      })
      .where(eq(pushSubscriptions.endpoint, endpoint));
  } else {
    await db.insert(pushSubscriptions).values({
      endpoint,
      userId: locals.user.id,
      p256dh: keys.p256dh,
      authKey: keys.auth,
      userAgent: ua,
    });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'JSON invalid' }), { status: 400 });
  }
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null;
  if (!endpoint) return new Response(JSON.stringify({ error: 'endpoint lipsește' }), { status: 400 });
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
