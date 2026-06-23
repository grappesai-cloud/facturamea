// TEMPORARY cleanup — delete test documents that NEVER reached ANAF (rejected or
// never submitted) from the solaastech test company. Hard safety: it refuses to
// delete anything that is ANAF-validated. Guarded by CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices, transportInvoiceLines, transportInvoicePayments, users } from '../../../db';
import { and, eq, inArray } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

const EMAIL = 'solaastech@gmail.com';
const TARGETS = ['TH 0001', 'SOL 0101', 'ST-2'];

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u?.companyId) return new Response(JSON.stringify({ error: 'cont inexistent' }), { status: 404 });
  const companyId = u.companyId;

  const rows = await db.select({ id: transportInvoices.id, fullNumber: transportInvoices.fullNumber, ef: transportInvoices.efacturaStatus })
    .from(transportInvoices)
    .where(and(eq(transportInvoices.companyId, companyId), inArray(transportInvoices.fullNumber, TARGETS)));

  // Safety: never delete an ANAF-validated document.
  const deletable = rows.filter((r) => r.ef !== 'validated');
  const blocked = rows.filter((r) => r.ef === 'validated').map((r) => r.fullNumber);
  const ids = deletable.map((r) => r.id);

  if (ids.length) {
    // Unlink any storno that points to a soon-deleted parent (avoid dangling ref).
    await db.update(transportInvoices).set({ parentInvoiceId: null } as any).where(inArray(transportInvoices.parentInvoiceId, ids));
    await db.delete(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, ids));
    await db.delete(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, ids));
    await db.delete(transportInvoices).where(inArray(transportInvoices.id, ids));
  }

  return new Response(JSON.stringify({
    ok: true,
    deleted: deletable.map((r) => r.fullNumber),
    blockedBecauseValidated: blocked,
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
