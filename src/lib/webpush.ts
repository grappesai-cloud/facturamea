// Web Push helper (VAPID). Lazily initialized so missing env doesn't
// crash unrelated cold starts.
//
// Generate keys once with:
//   npx web-push generate-vapid-keys
// then set in Vercel env:
//   PUBLIC_VAPID_PUBLIC_KEY=<public>
//   VAPID_PRIVATE_KEY=<private>
//   VAPID_CONTACT=mailto:contact@facturamea.com
//
// Public key is exposed to the client to call PushManager.subscribe().
// Private key MUST stay server-side.

import webpush from 'web-push';
import { db } from '../db';
import { pushSubscriptions } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { log } from './logger';

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const contact = process.env.VAPID_CONTACT || 'mailto:contact@facturamea.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(contact, pub, priv);
  configured = true;
  return true;
}

export function vapidPublicKey(): string | null {
  return process.env.PUBLIC_VAPID_PUBLIC_KEY || null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

// Send one push. Returns true on success. Caller handles batching.
async function sendOne(sub: { endpoint: string; p256dh: string; authKey: string }, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.authKey },
      },
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    await db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date(), consecutiveFailures: 0, lastError: null })
      .where(eq(pushSubscriptions.endpoint, sub.endpoint));
    return true;
  } catch (err: any) {
    const code = err?.statusCode;
    // 404/410 = subscription is gone; clean up.
    if (code === 404 || code === 410) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub.endpoint));
      log.info('push_subscription_evicted', { endpoint: sub.endpoint, code });
      return false;
    }
    await db
      .update(pushSubscriptions)
      .set({
        lastError: String(err?.body || err?.message || code).slice(0, 500),
        consecutiveFailures: sql`${pushSubscriptions.consecutiveFailures} + 1`,
      })
      .where(eq(pushSubscriptions.endpoint, sub.endpoint));
    log.warn('push_send_failed', { endpoint: sub.endpoint, code, err });
    return false;
  }
}

// Send to all subscriptions belonging to a user. Returns counts.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!ensureConfigured()) return { sent: 0, failed: 0 };
  const subs = await db
    .select({ endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, authKey: pushSubscriptions.authKey })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    const ok = await sendOne(s, payload);
    if (ok) sent++; else failed++;
  }
  return { sent, failed };
}
