import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices } from '../../../db/schema';
import { and, lt, sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

// facturamea — daily maintenance cron (06:00 UTC, see vercel.json).
// Marks unpaid documents past their due date as overdue. Authorized via CRON_SECRET.
export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  let overdueMarked = 0;
  try {
    const res = await db
      .update(transportInvoices)
      .set({ status: 'overdue' })
      .where(
        and(
          lt(transportInvoices.dueAt, new Date()),
          sql`${transportInvoices.status} IN ('issued','sent','partial')`,
        ),
      );
    overdueMarked = (res as any)?.rowCount ?? 0;
  } catch {
    // Never let the cron hard-fail.
  }

  return new Response(JSON.stringify({ ok: true, overdueMarked, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
