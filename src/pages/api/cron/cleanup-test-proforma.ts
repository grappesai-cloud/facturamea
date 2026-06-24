// TEMP diagnostic + one-shot cleanup. CRON_SECRET-guarded. Delete after use.
//   ?diag=1            -> dump ALL invoices + series for the company that owns
//                         SOL 0104, and search globally for the Dubai invoice.
//   ?confirm=DELETE    -> delete ONLY the test proforma (PF 0001 / Audit Test Client).
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices, transportInvoiceLines, invoiceSeries, companies, users, userCompanyMemberships } from '../../../db/schema';
import { and, eq, or, ilike, sql, desc } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { listMessages, downloadMessage } from '../../../lib/anaf/efactura-client';
import { unzipSync, strFromU8 } from 'fflate';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    // FINAL cleanup: clear SOL 0105's failed e-Factura state (out-of-scope export,
    // e-Factura not required) + delete the leftover test proforma PF 0001.
    if (url.searchParams.get('finalclean') === '1') {
      const out: Record<string, unknown> = {};
      // 1) Clear e-Factura status on SOL 0105 (keep it a valid issued invoice).
      const ef = await db.update(transportInvoices)
        .set({ efacturaStatus: null, efacturaError: null, efacturaAnafId: null, updatedAt: new Date() } as any)
        .where(and(eq(transportInvoices.fullNumber, 'SOL 0105'), eq(transportInvoices.kind, 'factura')));
      out.sol0105Cleared = (ef as any)?.rowCount ?? 'ok';
      // 2) Delete the test proforma PF 0001 (Audit Test Client) + its lines.
      const [pf] = await db.select().from(transportInvoices).where(and(
        eq(transportInvoices.kind, 'proforma'), eq(transportInvoices.fullNumber, 'PF 0001'),
        eq(transportInvoices.clientNameSnap, 'Audit Test Client'),
      ));
      if (pf) {
        await db.delete(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, pf.id));
        await db.delete(transportInvoices).where(eq(transportInvoices.id, pf.id));
        out.deletedProforma = 'PF 0001';
      } else out.deletedProforma = '(nu există)';
      return json(out);
    }

    // Dump the stored e-Factura XML (customer party) for a given invoice number.
    const xmlfor = url.searchParams.get('xmlfor');
    if (xmlfor) {
      const [iv] = await db.select({ xml: transportInvoices.efacturaXml, status: transportInvoices.efacturaStatus })
        .from(transportInvoices).where(and(eq(transportInvoices.fullNumber, xmlfor), eq(transportInvoices.kind, 'factura')));
      const xml = iv?.xml || '';
      const cust = xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/)?.[0] || '(fără customer party)';
      return json({ status: iv?.status, customerParty: cust, fullXmlLen: xml.length });
    }

    // Download + unzip an ANAF message (e.g. an error message) to read its content.
    const errdl = url.searchParams.get('errdl');
    if (errdl) {
      const [anchor] = await db.select().from(transportInvoices)
        .where(and(eq(transportInvoices.fullNumber, 'SOL 0104'), eq(transportInvoices.kind, 'factura')));
      const cid3 = anchor?.companyId;
      const dl = await downloadMessage(cid3!, errdl);
      if (!dl.ok || !dl.bytes) return json({ ok: false, error: dl.error });
      try {
        const files = unzipSync(new Uint8Array(dl.bytes));
        const out: Record<string, string> = {};
        for (const name of Object.keys(files)) out[name] = strFromU8(files[name]).slice(0, 4000);
        return json({ ok: true, files: out });
      } catch {
        return json({ ok: true, note: 'nu e zip', raw: Buffer.from(dl.bytes).toString('utf8').slice(0, 3000) });
      }
    }
    // ANAF check: did the original SOL 0105 / Dubai invoice already reach ANAF?
    if (url.searchParams.get('anafmsgs') === '1') {
      const [anchor] = await db.select().from(transportInvoices)
        .where(and(eq(transportInvoices.fullNumber, 'SOL 0104'), eq(transportInvoices.kind, 'factura')));
      const cid2 = anchor?.companyId;
      if (!cid2) return json({ ok: false, note: 'nu am găsit compania' });
      const r = await listMessages(cid2, '54888013', 7);
      // Surface only sent invoices (FACTURA TRIMISA) + anything mentioning the beneficiary.
      const msgs = (r.data?.mesaje || []);
      const sent = msgs.filter((m: any) => /TRIMIS/i.test(m.tip || ''));
      return json({ anafOk: r.ok, anafError: r.error, totalMessages: msgs.length, sentInvoices: sent, allMessages: msgs });
    }
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
