import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { auditLog, users } from '../../../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403 });
  }

  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('userId');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const conds = [];
  if (action) conds.push(eq(auditLog.action, action));
  if (userId) conds.push(eq(auditLog.userId, userId));

  const where = conds.length ? and(...conds) : undefined;

  const rows = await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      ipAddress: auditLog.ipAddress,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(auditLog)
    .where(where);

  return new Response(JSON.stringify({ results: rows, total: count, page, limit }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
