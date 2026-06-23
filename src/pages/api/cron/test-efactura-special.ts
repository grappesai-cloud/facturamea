// TEMP — test special VAT regimes (AE reverse charge, K intra-EU, E exempt) on
// ANAF sandbox for solaastech. Sets the company VAT-payer, crafts invoices with
// the right buyer + regime, submits, and (mode=check) reports verdicts. CRON_SECRET.
import type { APIRoute } from 'astro';
import { db, transportInvoices, transportInvoiceLines, invoiceClients, invoiceSeries, companies, users } from '../../../db';
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

  if ((url.searchParams.get('mode') || 'run') === 'check') {
    const rows = await db.select({ fullNumber: transportInvoices.fullNumber, anafId: transportInvoices.efacturaAnafId })
      .from(transportInvoices).where(and(eq(transportInvoices.companyId, cid), isNotNull(transportInvoices.efacturaAnafId), like(transportInvoices.notes, 'TEST-SPECIAL%')));
    const out: any[] = [];
    for (const r of rows) {
      const e: any = { nr: r.fullNumber };
      try {
        const st = await getSubmissionStatus(cid, r.anafId as string);
        e.stare = st.raw?.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || st.error;
        const idd = st.raw?.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || '';
        if (idd && e.stare === 'nok') { const dl = await downloadMessage(cid, idd); if (dl.ok && dl.bytes) { let all=''; try{const f=unzipSync(new Uint8Array(dl.bytes));for(const[n,b]of Object.entries(f))if(!/semnatura/i.test(n))all+=strFromU8(b as Uint8Array);}catch{all=strFromU8(new Uint8Array(dl.bytes));} e.errors = Array.from(all.matchAll(/errorMessage\s*=\s*"([^"]+)"/gi)).map(m=>m[1]).slice(0,8); } }
      } catch (err) { e.error = String((err as Error).message); }
      out.push(e);
    }
    return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // Ensure a DE client for the intra-EU (K) case.
  let deClientId: string;
  const [dec] = await db.select({ id: invoiceClients.id }).from(invoiceClients).where(and(eq(invoiceClients.ownerCompanyId, cid), eq(invoiceClients.taxId, 'DE811234567'))).limit(1);
  if (dec) deClientId = dec.id;
  else { deClientId = nanoid(); await db.insert(invoiceClients).values({ id: deClientId, ownerCompanyId: cid, name: 'MUSTER GMBH', taxId: 'DE811234567', address: 'Hauptstrasse 1', city: 'Berlin', country: 'Germania' } as any); }

  async function mk(regime: string, clientName: string, taxId: string, clientExternalId?: string) {
    const series = await ensureDefaultSeries(cid, 'factura', clientExternalId ? 'external' : null);
    const num = await nextSeriesNumber(series.id, INVOICE_NUMBER_FORMAT);
    const id = nanoid(); const now = new Date();
    await db.insert(transportInvoices).values({ id, companyId: cid, issuedByUserId: uid, seriesId: series.id, sequenceNumber: num.number, fullNumber: num.fullNumber, kind: 'factura', clientExternalId: clientExternalId || null, clientNameSnap: clientName, clientTaxIdSnap: taxId, clientAddressSnap: 'JUD. CONSTANTA, MUN. CONSTANTA', currency: 'RON', vatRegime: regime, subtotalCents: 100000, vatCents: 0, totalCents: 100000, paidCents: 0, status: 'issued', issuedAt: now, dueAt: now, notes: 'TEST-SPECIAL' } as any);
    await db.insert(transportInvoiceLines).values({ id: nanoid(), invoiceId: id, position: 0, description: 'Servicii test', quantity: 1, unit: 'buc', unitPriceCents: 100000, vatRate: 0, lineTotalCents: 100000 } as any);
    return id;
  }

  await db.update(companies).set({ isVatPayer: true } as any).where(eq(companies.id, cid));
  const results: any[] = [];
  for (const sc of [
    { name: 'AE taxare inversă', regime: 'reverse_charge', client: 'DENISA IVAN ARCHITECTURE SRL', tax: '47389851' },
    { name: 'E scutit', regime: 'exempt', client: 'DENISA IVAN ARCHITECTURE SRL', tax: '47389851' },
    { name: 'K intracomunitar (DE)', regime: 'intra_eu', client: 'MUSTER GMBH', tax: 'DE811234567', ext: deClientId },
  ]) {
    const id = await mk(sc.regime, sc.client, sc.tax, (sc as any).ext);
    const r = await submitInvoiceToAnaf(id, { userId: uid });
    results.push({ scenario: sc.name, submitted: r.ok, index: (r as any).spvIndex, err: (r as any).error });
  }
  await db.update(companies).set({ isVatPayer: false } as any).where(eq(companies.id, cid));
  return new Response(JSON.stringify({ ok: true, results }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
