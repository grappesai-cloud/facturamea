// TEMP one-shot: delete the leftover AUDIT TEST proforma (PF 0001 / "Audit Test
// Client") + its lines. Surgical exact-match so nothing real is touched.
// CRON_SECRET-guarded. Delete this file right after running.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices, transportInvoiceLines } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    // Match ONLY the test proforma: kind=proforma + fullNumber='PF 0001' +
    // clientNameSnap='Audit Test Client'. Refuse if it doesn't match exactly.
    const rows = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.kind, 'proforma'),
      eq(transportInvoices.fullNumber, 'PF 0001'),
      eq(transportInvoices.clientNameSnap, 'Audit Test Client'),
    ));
    if (rows.length !== 1) {
      return new Response(JSON.stringify({ ok: false, matched: rows.length, note: 'nu am găsit exact 1 proformă test; nu șterg nimic' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const inv = rows[0];
    await db.delete(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, inv.id));
    await db.delete(transportInvoices).where(eq(transportInvoices.id, inv.id));
    return new Response(JSON.stringify({ ok: true, deleted: inv.fullNumber, id: inv.id, companyId: inv.companyId }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
