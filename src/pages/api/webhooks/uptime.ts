import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { siteBanner, auditLog } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// UptimeRobot webhook receiver. Configure in UptimeRobot dashboard:
//   Alert Contacts → Add → Webhook
//   POST URL: https://www.facturamea.com/api/webhooks/uptime?secret=<UPTIME_WEBHOOK_SECRET>
//   Send as: JSON
//   Body template:
//     {
//       "monitorURL": "*monitorURL*",
//       "monitorFriendlyName": "*monitorFriendlyName*",
//       "alertType": "*alertType*",
//       "alertTypeFriendlyName": "*alertTypeFriendlyName*",
//       "alertDetails": "*alertDetails*",
//       "alertDuration": "*alertDuration*",
//       "alertDateTime": "*alertDateTime*"
//     }
//
// On Down: creates a critical site banner. On Up: clears it.
// Always logs to audit_log for forensic.
export const POST: APIRoute = async ({ url, request }) => {
  const secret = url.searchParams.get('secret') || '';
  const expected = process.env.UPTIME_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as any;
  const isDown = String(body.alertType || '') === '1' || /down/i.test(body.alertTypeFriendlyName || '');
  const isUp   = String(body.alertType || '') === '2' || /up/i.test(body.alertTypeFriendlyName || '');

  // Critical banner on down
  if (isDown) {
    try {
      // Deactivate any active banner first
      await db.update(siteBanner).set({ active: false }).where(eq(siteBanner.active, true));
      await db.insert(siteBanner).values({
        id: nanoid(),
        message: `🔴 ${body.monitorFriendlyName || 'Sistem'} este DOWN. Lucrăm la rezolvare.`,
        severity: 'critical',
        active: true,
        createdBy: 'webhook:uptime',
      } as any);
    } catch (err) { console.error('uptime webhook banner insert failed', err); }
  }
  // Clear banner on up
  if (isUp) {
    try {
      await db.update(siteBanner).set({ active: false }).where(eq(siteBanner.active, true));
    } catch (err) { console.error('uptime webhook banner clear failed', err); }
  }

  // Audit
  try {
    await db.insert(auditLog).values({
      id: nanoid(),
      action: isDown ? 'uptime.down' : (isUp ? 'uptime.up' : 'uptime.event'),
      entityType: 'monitor',
      entityId: body.monitorURL || null,
      metadata: JSON.stringify(body),
    } as any);
  } catch {}

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
