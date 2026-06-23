// TEMP e-Factura test harness (ANAF TEST/sandbox). Creates invoices across VAT
// scenarios for the solaastech company, submits each to ANAF sandbox, and (mode=check)
// reports the validation verdict + real error text. CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices, transportInvoiceLines, companies, users } from '../../../db';
import { and, eq, isNotNull, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT } from '../../../lib/invoicing';
import { submitInvoiceToAnaf } from '../../../lib/efactura-submit';
import { getSubmissionStatus, downloadMessage } from '../../../lib/anaf/efactura-client';
import { unzipSync, strFromU8 } from 'fflate';
import { isCronAuthorized } from '../../../lib/cron-auth';

const EMAIL = 'solaastech@gmail.com';

export const GET: APIRoute = async ({ request, url }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const [u] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u?.companyId) return new Response(JSON.stringify({ error: 'cont inexistent' }), { status: 404 });
  const cid = u.companyId, uid = u.id;
  const mode = url.searchParams.get('mode') || 'run';

  // ── mode=check: report ANAF verdict + errors for all TST-* invoices ──
  if (mode === 'check') {
    const rows = await db.select({ fullNumber: transportInvoices.fullNumber, anafId: transportInvoices.efacturaAnafId, ef: transportInvoices.efacturaStatus })
      .from(transportInvoices).where(and(eq(transportInvoices.companyId, cid), isNotNull(transportInvoices.efacturaAnafId), like(transportInvoices.notes, 'TEST-HARNESS%')));
    const out: any[] = [];
    for (const r of rows) {
      const e: any = { nr: r.fullNumber, local: r.ef };
      try {
        const st = await getSubmissionStatus(cid, r.anafId as string);
        e.stare = st.raw?.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || st.error;
        const idd = st.raw?.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || '';
        if (idd && e.stare === 'nok') {
          const dl = await downloadMessage(cid, idd);
          if (dl.ok && dl.bytes) { let all=''; try{const f=unzipSync(new Uint8Array(dl.bytes));for(const[n,b]of Object.entries(f))all+=strFromU8(b as Uint8Array);}catch{all=strFromU8(new Uint8Array(dl.bytes));} e.errors = Array.from(all.matchAll(/errorMessage\s*=\s*"([^"]+)"/gi)).map(m=>m[1]).slice(0,10); }
        }
      } catch (err) { e.error = String((err as Error).message); }
      out.push(e);
    }
    return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // ── mode=run: create + submit test invoices ──
  async function mkInvoice(opts: { currency: string; lines: { desc: string; qty: number; priceCents: number; vat: number }[]; kind?: string; parentId?: string }) {
    const series = await ensureDefaultSeries(cid, (opts.kind as any) || 'factura', null);
    const num = await nextSeriesNumber(series.id, INVOICE_NUMBER_FORMAT);
    const id = nanoid(); const now = new Date();
    let sub = 0, vat = 0;
    const lines = opts.lines.map((l, i) => { const ls = Math.round(l.qty*l.priceCents); const lv = Math.round(ls*l.vat/100); sub+=ls; vat+=lv; return { id: nanoid(), invoiceId: id, position: i, description: l.desc, quantity: l.qty, unit: 'buc', unitPriceCents: l.priceCents, vatRate: l.vat, lineTotalCents: ls+lv }; });
    await db.insert(transportInvoices).values({ id, companyId: cid, issuedByUserId: uid, seriesId: series.id, sequenceNumber: num.number, fullNumber: num.fullNumber, kind: (opts.kind as any)||'factura', clientNameSnap: 'DENISA IVAN ARCHITECTURE SRL', clientTaxIdSnap: '47389851', clientAddressSnap: 'JUD. CONSTANTA, MUN. CONSTANTA', currency: opts.currency, vatRegime: 'standard', subtotalCents: sub, vatCents: vat, totalCents: sub+vat, paidCents: 0, status: 'issued', issuedAt: now, dueAt: now, bnrRate: opts.currency!=='RON'?5:null, bnrRateDate: opts.currency!=='RON'?now:null, parentInvoiceId: opts.parentId||null, notes: 'TEST-HARNESS' } as any);
    if (lines.length) await db.insert(transportInvoiceLines).values(lines as any);
    return { id, fullNumber: num.fullNumber };
  }

  const results: any[] = [];
  // 1) VAT payer scenarios
  await db.update(companies).set({ isVatPayer: true } as any).where(eq(companies.id, cid));
  for (const sc of [
    { name: 'S 21% RON', currency: 'RON', lines: [{ desc: 'Consultanta', qty: 2, priceCents: 10000, vat: 21 }] },
    { name: 'Z 0% RON', currency: 'RON', lines: [{ desc: 'Scutit zero', qty: 1, priceCents: 50000, vat: 0 }] },
    { name: 'EUR 21% (valuta)', currency: 'EUR', lines: [{ desc: 'Export servicii', qty: 1, priceCents: 100000, vat: 21 }] },
  ]) {
    const inv = await mkInvoice(sc as any);
    const r = await submitInvoiceToAnaf(inv.id, { userId: uid });
    results.push({ scenario: sc.name, nr: inv.fullNumber, submitted: r.ok, index: (r as any).spvIndex, err: (r as any).error });
  }
  // 2) Non-payer category O
  await db.update(companies).set({ isVatPayer: false } as any).where(eq(companies.id, cid));
  {
    const inv = await mkInvoice({ currency: 'RON', lines: [{ desc: 'Serviciu neplatitor', qty: 1, priceCents: 30000, vat: 0 }] });
    const r = await submitInvoiceToAnaf(inv.id, { userId: uid });
    results.push({ scenario: 'O neplatitor', nr: inv.fullNumber, submitted: r.ok, index: (r as any).spvIndex, err: (r as any).error });
  }
  return new Response(JSON.stringify({ ok: true, results }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
