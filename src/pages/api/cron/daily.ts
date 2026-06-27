import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices, users } from '../../../db/schema';
import { and, lt, sql, isNotNull, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { refreshExpiringTokens } from '../../../lib/anaf/tokens';
import { syncEfacturaStatuses } from '../../../lib/anaf/efactura-sync';
import { syncAllInboxes } from '../../../lib/anaf/inbox-sync';
import { startOfTodayRO } from '../../../lib/dates';

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
          lt(transportInvoices.dueAt, startOfTodayRO()),
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

  // SPV inbox auto-sync: pull received supplier e-Facturi for every connected
  // company so they show up in "Facturi primite" ready to import, without the
  // user having to press "Sincronizează".
  let inboxCompanies = 0, inboxSynced = 0;
  try {
    const r = await syncAllInboxes();
    inboxCompanies = r.companies; inboxSynced = r.synced;
  } catch { /* never hard-fail the cron */ }

  // GDPR right-to-erasure: scrub residual PII from accounts soft-deleted >30 days
  // ago (name/phone/credentials/2FA/avatar). Fiscally-mandated documents stay; the
  // person is no longer identifiable. (A hard row delete is blocked by FKs.)
  let gdprPurged = 0;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const res = await db.update(users).set({
      name: 'Cont șters', phone: null, avatarUrl: null,
      hashedPassword: `purged-${nanoid(24)}`, totpSecret: null, totpRecoveryCodes: null,
      totpEnabled: false, isActive: false,
    } as any).where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff), ne(users.name, 'Cont șters')));
    gdprPurged = (res as any)?.rowCount ?? 0;
  } catch (e) { console.error('gdpr purge failed:', e); }

  return new Response(JSON.stringify({ ok: true, overdueMarked, anafRefreshed, anafFailed, efChecked, efValidated, efRejected, inboxCompanies, inboxSynced, gdprPurged, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
