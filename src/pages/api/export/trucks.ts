import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { availableTrucks } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { toCsv, csvResponse } from '../../../lib/csv';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără companie' }), { status: 400 });

  const rows = await db
    .select()
    .from(availableTrucks)
    .where(eq(availableTrucks.companyId, locals.user.companyId))
    .orderBy(desc(availableTrucks.createdAt));

  const csv = toCsv(rows as any);
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(`camioane-${date}.csv`, csv);
};
