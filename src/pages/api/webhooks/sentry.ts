import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { db } from '../../../db';
import { auditLog } from '../../../db/schema';
import { nanoid } from 'nanoid';

// Constant-time string compare; false when either side is empty.
function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Sentry webhook receiver — logs new issues to audit_log so we can see
// production errors in /admin/audit without needing to log into Sentry.
//
// Auth: shared secret sent in the `X-Webhook-Secret` header (preferred). For
// backward-compat during rollout we also accept it in the `?secret=` query
// string. Compared in constant time. Fails closed when the env var is unset.
//
// Configure in Sentry: Settings → Integrations → Webhooks → Add Webhook
//   URL: https://www.facturamea.com/api/webhooks/sentry
//   Header: X-Webhook-Secret: <SENTRY_WEBHOOK_SECRET>
//   Events: issue.created, issue.resolved
export const POST: APIRoute = async ({ url, request }) => {
  const provided = request.headers.get('x-webhook-secret') || url.searchParams.get('secret') || '';
  const expected = process.env.SENTRY_WEBHOOK_SECRET || '';
  if (!expected || !safeEqual(provided, expected)) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as any;
  const action = String(body.action || 'unknown');
  const issue = body.data?.issue || body.issue || {};

  try {
    await db.insert(auditLog).values({
      id: nanoid(),
      action: `sentry.${action}`,
      entityType: 'sentry_issue',
      entityId: issue.id ?? issue.short_id ?? null,
      metadata: JSON.stringify({
        title: issue.title,
        culprit: issue.culprit,
        level: issue.level,
        permalink: issue.permalink,
        count: issue.count,
        firstSeen: issue.firstSeen,
        lastSeen: issue.lastSeen,
      }),
    } as any);
  } catch (err) {
    console.error('sentry webhook audit failed', err);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
