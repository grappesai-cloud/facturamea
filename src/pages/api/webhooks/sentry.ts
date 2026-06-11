import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { auditLog } from '../../../db/schema';
import { nanoid } from 'nanoid';

// Sentry webhook receiver — logs new issues to audit_log so we can see
// production errors in /admin/audit without needing to log into Sentry.
//
// Configure in Sentry: Settings → Integrations → Webhooks → Add Webhook
//   URL: https://www.facturamea.com/api/webhooks/sentry?secret=<SENTRY_WEBHOOK_SECRET>
//   Events: issue.created, issue.resolved
export const POST: APIRoute = async ({ url, request }) => {
  const secret = url.searchParams.get('secret') || '';
  const expected = process.env.SENTRY_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
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
