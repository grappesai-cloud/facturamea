// TEMP diagnostic + one-shot cleanup. CRON_SECRET-guarded. Delete after use.
//   ?diag=1            -> dump ALL invoices + series for the company that owns
//                         SOL 0104, and search globally for the Dubai invoice.
//   ?confirm=DELETE    -> delete ONLY the test proforma (PF 0001 / Audit Test Client).
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices, transportInvoiceLines, invoiceSeries, companies, users, userCompanyMemberships } from '../../../db/schema';
import { and, eq, or, ilike, sql, desc } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    // Find the company that owns SOL 0104 (the real INVA invoice).
    const [anchor] = await db.select().from(transportInvoices)
      .where(and(eq(transportInvoices.fullNumber, 'SOL 0104'), eq(transportInvoices.kind, 'factura')));
    const cid = anchor?.companyId || null;

    if (url.searchParams.get('confirm') === 'DELETE') {
      const rows = await db.select().from(transportInvoices).where(and(
        eq(transportInvoices.kind, 'proforma'),
        eq(transportInvoices.fullNumber, 'PF 0001'),
        eq(transportInvoices.clientNameSnap, 'Audit Test Client'),
      ));
      if (rows.length !== 1) return json({ ok: false, matched: rows.length, note: 'nu șterg, nu e exact 1' });
      await db.delete(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, rows[0].id));
      await db.delete(transportInvoices).where(eq(transportInvoices.id, rows[0].id));
      return json({ ok: true, deleted: 'PF 0001', id: rows[0].id });
    }

    // Diagnostic: every invoice on that company + everything that looks like the Dubai doc.
    const onCompany = cid ? await db.select({
      n: transportInvoices.fullNumber, k: transportInvoices.kind, s: transportInvoices.status,
      client: transportInvoices.clientNameSnap, cur: transportInvoices.currency,
      total: transportInvoices.totalCents, created: transportInvoices.createdAt,
    }).from(transportInvoices).where(eq(transportInvoices.companyId, cid)) : [];

    const dubaiSearch = await db.select({
      n: transportInvoices.fullNumber, k: transportInvoices.kind, s: transportInvoices.status,
      client: transportInvoices.clientNameSnap, cur: transportInvoices.currency,
      company: transportInvoices.companyId, total: transportInvoices.totalCents,
    }).from(transportInvoices).where(or(
      eq(transportInvoices.fullNumber, 'SOL 0105'),
      ilike(transportInvoices.clientNameSnap, '%DNA%'),
      ilike(transportInvoices.clientNameSnap, '%Music%'),
      ilike(transportInvoices.clientNameSnap, '%FZ%'),
      ilike(transportInvoices.clientNameSnap, '%Dubai%'),
    ));

    const series = cid ? await db.select({ prefix: invoiceSeries.prefix, kind: invoiceSeries.kind, next: invoiceSeries.nextNumber })
      .from(invoiceSeries).where(eq(invoiceSeries.companyId, cid)) : [];

    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(transportInvoices);

    // Full dump of every invoice in the DB so we can eyeball the Dubai one under ANY name/company.
    const allInvoices = await db.select({
      n: transportInvoices.fullNumber, k: transportInvoices.kind, s: transportInvoices.status,
      client: transportInvoices.clientNameSnap, cur: transportInvoices.currency,
      total: transportInvoices.totalCents, company: transportInvoices.companyId,
      created: transportInvoices.createdAt,
    }).from(transportInvoices).orderBy(desc(transportInvoices.createdAt));

    // Companies the solaastech user belongs to.
    const [u] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, 'solaastech@gmail.com'));
    const memberships = u ? await db.select({ companyId: userCompanyMemberships.companyId }).from(userCompanyMemberships).where(eq(userCompanyMemberships.userId, u.id)) : [];
    const companyIds = Array.from(new Set([u?.companyId, ...memberships.map((m) => m.companyId)].filter(Boolean)));
    const myCompanies = companyIds.length ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(or(...companyIds.map((x) => eq(companies.id, x as string)))) : [];

    return json({ anchorCompany: cid, invoicesOnCompany: onCompany, dubaiSearch, series, totalInvoicesWholeDb: Number(c), userActiveCompany: u?.companyId, myCompanies, allInvoices });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
};

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
}
