import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users, companies, broadcasts, notifications } from '../../../db/schema';
import { eq, sql, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sendEmail } from '../../../lib/notifications';
import { logAction } from '../../../lib/audit';

function buildSegmentQuery(segment: string) {
  if (segment === 'all') return undefined;
  if (segment.startsWith('tier:')) {
    const tier = segment.slice(5);
    // join companies via subquery
    return sql`${users.companyId} IN (SELECT id FROM companies WHERE subscription_tier = ${tier})`;
  }
  // user_type segments
  return eq(users.userType, segment);
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  if (url.searchParams.get('preview') !== '1') return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  const segment = url.searchParams.get('segment') || 'all';
  try {
    const cond = buildSegmentQuery(segment);
    const q = db.select({ c: sql<number>`COUNT(*)::int` }).from(users).where(and(isNull(users.deletedAt), cond as any));
    const [r] = await q;
    return new Response(JSON.stringify({ count: r?.c ?? 0 }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ count: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Bad JSON' }), { status: 400 }); }

  const { segment, title, body: messageBody, sendEmail: doEmail } = body;
  if (!segment || !title || !messageBody) {
    return new Response(JSON.stringify({ error: 'segment, title, body sunt obligatorii' }), { status: 400 });
  }

  // Resolve recipients
  const cond = buildSegmentQuery(segment);
  const recipients = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(isNull(users.deletedAt), cond as any));

  // Insert in-app notifications in batch (chunked)
  const now = new Date();
  for (let i = 0; i < recipients.length; i += 200) {
    const chunk = recipients.slice(i, i + 200);
    const rows = chunk.map((u) => ({
      id: nanoid(), userId: u.id, type: 'system' as const,
      title: String(title).slice(0, 500),
      body: String(messageBody).slice(0, 2000),
      createdAt: now,
    } as any));
    try { await db.insert(notifications).values(rows); } catch (err) { console.error('notif insert', err); }
  }

  // Optional emails (fire-and-forget per user; rate-limit is the caller's concern)
  let emailsSent = 0;
  if (doEmail) {
    for (const u of recipients) {
      try {
        await sendEmail(u.email, title, messageBody);
        emailsSent++;
      } catch (err) {
        console.warn('broadcast email failed for', u.email, err);
      }
    }
  }

  const broadcastId = nanoid();
  await db.insert(broadcasts).values({
    id: broadcastId,
    title: String(title).slice(0, 500),
    body: String(messageBody),
    segment,
    sendEmail: !!doEmail,
    recipientsCount: recipients.length,
    sentBy: locals.user.id,
  } as any);

  await logAction({
    userId: locals.user.id, companyId: locals.user.companyId,
    action: 'admin.broadcast_sent', entityType: 'broadcast', entityId: broadcastId,
    metadata: { segment, recipientsCount: recipients.length, emailsSent }, request,
  });

  return new Response(JSON.stringify({
    ok: true, broadcastId, recipientsCount: recipients.length, emailsSent,
  }), { headers: { 'Content-Type': 'application/json' } });
};
