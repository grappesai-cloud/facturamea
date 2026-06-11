import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { notifications } from '../../../db/schema';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  const onlyUnread = url.searchParams.get('unread') === '1';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 30;
  const offset = (page - 1) * limit;

  const conditions = [eq(notifications.userId, locals.user.id)];
  if (onlyUnread) conditions.push(isNull(notifications.readAt));

  const rows = await db.select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const [unreadResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, locals.user.id), isNull(notifications.readAt)));

  return new Response(JSON.stringify({
    results: rows,
    unreadCount: unreadResult?.count ?? 0,
    page,
    limit,
  }), { headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const markAll = body.markAllRead === true;
  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];

  if (markAll) {
    await db.update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, locals.user.id), isNull(notifications.readAt)));
  } else if (ids.length) {
    for (const id of ids) {
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, locals.user.id)));
    }
  }

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
