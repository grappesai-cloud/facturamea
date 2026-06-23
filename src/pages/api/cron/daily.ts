import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices } from '../../../db/schema';
import { and, lt, sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { refreshExpiringTokens } from '../../../lib/anaf/tokens';
import { syncEfacturaStatuses } from '../../../lib/anaf/efactura-sync';

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
  } catch (e) {
    console.error('daily cron step failed:', e); // log but never hard-fail the cron
  }

  // ANAF OAuth maintenance: renew access tokens expiring within 7 days.
  let anafRefreshed = 0, anafFailed = 0;
  try {
    const r = await refreshExpiringTokens();
    anafRefreshed = r.refreshed;
    anafFailed = r.failed;
  } catch (e) {
    console.error('daily cron step failed:', e); // log but never hard-fail the cron
  }

  // e-Factura status sync: advance 'submitted' uploads to 'validated'/'rejected'
  // per ANAF's stareMesaj, so the platform reflects the real verdict.
  let efChecked = 0, efValidated = 0, efRejected = 0;
  try {
    const r = await syncEfacturaStatuses();
    efChecked = r.checked; efValidated = r.validated; efRejected = r.rejected;
  } catch { /* never hard-fail the cron */ }

  return new Response(JSON.stringify({ ok: true, overdueMarked, anafRefreshed, anafFailed, efChecked, efValidated, efRejected, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
