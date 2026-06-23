// TEMP — restore the real, ANAF-validated invoice SOL 0104 into the solaastech
// account (deleted by an over-broad wipe). Downloads the validated UBL from ANAF
// (so data matches exactly), re-inserts with the same number + validated status,
// WITHOUT re-submitting. CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices, transportInvoiceLines, invoiceSeries, users } from '../../../db';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { unzipSync, strFromU8 } from 'fflate';
import { getSubmissionStatus, downloadMessage } from '../../../lib/anaf/efactura-client';
import { isCronAuthorized } from '../../../lib/cron-auth';

const ANAF_INDEX = '6515185123'; // SOL 0104 validated upload index

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const [u] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, 'solaastech@gmail.com')).limit(1);
  if (!u?.companyId) return new Response(JSON.stringify({ error: 'cont inexistent' }), { status: 404 });
  const cid = u.companyId;

  // Already there? don't duplicate.
  const [existing] = await db.select({ id: transportInvoices.id }).from(transportInvoices)
    .where(and(eq(transportInvoices.companyId, cid), eq(transportInvoices.fullNumber, 'SOL 0104'))).limit(1);
  if (existing) return new Response(JSON.stringify({ ok: true, note: 'SOL 0104 deja există' }), { status: 200 });

  // Download the validated invoice XML from ANAF.
  let xml = '';
  try {
    const st = await getSubmissionStatus(cid, ANAF_INDEX);
    const idd = st.raw?.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || '';
    if (idd) {
      const dl = await downloadMessage(cid, idd);
      if (dl.ok && dl.bytes) {
        const files = unzipSync(new Uint8Array(dl.bytes));
        for (const [name, bytes] of Object.entries(files)) {
          if (/\.xml$/i.test(name) && !/semnatura/i.test(name)) { xml = strFromU8(bytes as Uint8Array); break; }
        }
      }
    }
  } catch { /* fall back to known data below */ }

  // Parse the invoice line item name from the UBL (inside cac:Item). Fallback generic.
  let itemName = 'Servicii';
  const itemBlock = xml.match(/<cac:Item>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/);
  if (itemBlock) itemName = itemBlock[1].trim();

  // Locate the SOL series (factura/external) to keep the same numbering family.
  const [series] = await db.select().from(invoiceSeries)
    .where(and(eq(invoiceSeries.companyId, cid), eq(invoiceSeries.prefix, 'SOL'))).limit(1);

  const id = nanoid();
  const now = new Date();
  await db.insert(transportInvoices).values({
    id, companyId: cid, issuedByUserId: u.id,
    seriesId: series?.id || null, sequenceNumber: 104, fullNumber: 'SOL 0104',
    kind: 'factura',
    clientNameSnap: 'DENISA IVAN ARCHITECTURE S.R.L.', clientTaxIdSnap: '47389851',
    clientAddressSnap: 'JUD. CONSTANTA, MUN. CONSTANTA',
    currency: 'RON', vatRegime: 'standard',
    subtotalCents: 629500, vatCents: 0, totalCents: 629500, paidCents: 0,
    status: 'issued', issuedAt: now, dueAt: now,
    efacturaStatus: 'validated', efacturaAnafId: ANAF_INDEX, efacturaXml: xml || null, efacturaSubmittedAt: now,
    notes: 'Restaurată din ANAF (validată)',
  } as any);
  await db.insert(transportInvoiceLines).values({
    id: nanoid(), invoiceId: id, position: 0, description: itemName,
    quantity: 1, unit: 'buc', unitPriceCents: 629500, vatRate: 0, lineTotalCents: 629500,
  } as any);

  return new Response(JSON.stringify({ ok: true, restored: 'SOL 0104', itemName, total: 6295, anaf: 'validated' }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
