import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { waitlistSignups } from '../../../db/schema';
import { eq, desc, and, or, ilike, isNotNull, isNull } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const companyType = url.searchParams.get('companyType') || '';
  const thankYouSent = url.searchParams.get('thankYouSent') || ''; // 'yes' | 'no' | ''
  const search = url.searchParams.get('search') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (companyType) conditions.push(eq(waitlistSignups.companyType, companyType));
  if (thankYouSent === 'yes') conditions.push(isNotNull(waitlistSignups.thankYouSentAt));
  if (thankYouSent === 'no') conditions.push(isNull(waitlistSignups.thankYouSentAt));
  if (search) {
    conditions.push(
      or(
        ilike(waitlistSignups.email, `%${search}%`),
        ilike(waitlistSignups.name, `%${search}%`),
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(waitlistSignups)
    .where(where)
    .orderBy(desc(waitlistSignups.createdAt))
    .limit(limit)
    .offset(offset);

  return new Response(JSON.stringify({ rows, page, limit }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Lipsă parametru id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await db.delete(waitlistSignups).where(eq(waitlistSignups.id, id));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
