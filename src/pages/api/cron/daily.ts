import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices } from '../../../db/schema';
import { and, lt, sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { refreshExpiringTokens } from '../../../lib/anaf/tokens';

// facturamea — daily maintenance cron (06:00 UTC, see vercel.json).
// Marks unpaid documents past their due date as overdue, and proactively
// refreshes ANAF tokens nearing expiry so dormant companies stay connected
// (active companies also refresh lazily on use). Authorized via CRON_SECRET.
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

  // ANAF OAuth maintenance: renew access tokens expiring within 7 days.
  let anafRefreshed = 0, anafFailed = 0;
  try {
    const r = await refreshExpiringTokens();
    anafRefreshed = r.refreshed;
    anafFailed = r.failed;
  } catch {
    // Never let the cron hard-fail.
  }

  return new Response(JSON.stringify({ ok: true, overdueMarked, anafRefreshed, anafFailed, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
