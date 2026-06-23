// TEMPORARY — wipe ALL invoices/stornos (+ lines + payments) for the solaastech
// TEST company so the account starts clean. NOTE: this only clears the local DB;
// ANAF-validated documents remain at ANAF (cannot be deleted there). CRON_SECRET.
// DELETE this file after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices, transportInvoiceLines, transportInvoicePayments, users } from '../../../db';
import { eq, inArray } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

const EMAIL = 'solaastech@gmail.com';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u?.companyId) return new Response(JSON.stringify({ error: 'cont inexistent' }), { status: 404 });
  const companyId = u.companyId;

  const rows = await db.select({ id: transportInvoices.id, fullNumber: transportInvoices.fullNumber })
    .from(transportInvoices).where(eq(transportInvoices.companyId, companyId));
  const ids = rows.map((r) => r.id);

  if (ids.length) {
    await db.update(transportInvoices).set({ parentInvoiceId: null } as any).where(inArray(transportInvoices.parentInvoiceId, ids));
    await db.delete(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, ids));
    await db.delete(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, ids));
    await db.delete(transportInvoices).where(inArray(transportInvoices.id, ids));
  }

  return new Response(JSON.stringify({ ok: true, deleted: rows.map((r) => r.fullNumber) }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
