// POST /api/invoicing/invoices/[id]/storno
// Creates a storno (cancellation) invoice that mirrors the original with
// negative-signed amounts. Links via parent_invoice_id and reserves the
// next number from the storno series (auto-created if missing).

import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines } from '../../../../../db/schema';
import { eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber } from '../../../../../lib/invoicing';

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const id = params.id as string;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const [parent] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, id)).limit(1);
  if (!parent) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
  if (parent.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });
  if (parent.kind !== 'factura') return new Response(JSON.stringify({ error: 'Doar facturile pot fi stornate' }), { status: 400 });
  if (parent.status === 'voided') return new Response(JSON.stringify({ error: 'Factura e deja anulată' }), { status: 400 });

  // Reserve a number from the storno series.
  const series = await ensureDefaultSeries(parent.companyId, 'storno');
  const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id);

  // Mirror parent lines with negative amounts.
  const parentLines = await db.select().from(transportInvoiceLines)
    .where(eq(transportInvoiceLines.invoiceId, parent.id))
    .orderBy(asc(transportInvoiceLines.position));

  const stornoId = nanoid();
  const now = new Date();

  await db.insert(transportInvoices).values({
    id: stornoId,
    companyId: parent.companyId,
    issuedByUserId: locals.user.id,
    seriesId: series.id,
    sequenceNumber,
    fullNumber,
    kind: 'storno',
    clientCompanyId: parent.clientCompanyId,
    clientExternalId: parent.clientExternalId,
    clientNameSnap: parent.clientNameSnap,
    clientTaxIdSnap: parent.clientTaxIdSnap,
    clientAddressSnap: parent.clientAddressSnap,
    orderId: parent.orderId,
    parentInvoiceId: parent.id,
    modelId: parent.modelId,
    currency: parent.currency,
    vatRegime: parent.vatRegime,
    subtotalCents: -parent.subtotalCents,
    vatCents: -parent.vatCents,
    totalCents: -parent.totalCents,
    paidCents: 0,
    status: 'issued',
    issuedAt: now,
    bnrRate: parent.bnrRate,
    bnrRateDate: parent.bnrRateDate,
    vatAtCollection: parent.vatAtCollection,
    notes: `Storno la factura ${parent.fullNumber}`,
  });

  if (parentLines.length) {
    await db.insert(transportInvoiceLines).values(parentLines.map((l) => ({
      id: nanoid(),
      invoiceId: stornoId,
      position: l.position,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: -l.unitPriceCents,
      vatRate: l.vatRate,
      lineTotalCents: -l.lineTotalCents,
    })));
  }

  // Mark parent voided (the storno is its annulment).
  await db.update(transportInvoices)
    .set({ status: 'voided', updatedAt: now })
    .where(eq(transportInvoices.id, parent.id));

  return new Response(JSON.stringify({ id: stornoId, fullNumber }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
