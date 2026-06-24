// POST /api/invoicing/invoices/[id]/storno
// Creates a storno (cancellation) invoice that mirrors the original with
// negative-signed amounts. Links via parent_invoice_id and reserves the
// next number from the storno series (auto-created if missing).

import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines, stockMovements } from '../../../../../db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber } from '../../../../../lib/invoicing';
import { applyStockIn } from '../../../../../lib/stock';
import { requireRole } from '../../../../../lib/require-role';

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const forbidden = requireRole(locals, 'invoice.delete');
  if (forbidden) return forbidden;
  const id = params.id as string;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const [parent] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, id)).limit(1);
  if (!parent) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
  if (parent.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });
  if (parent.kind !== 'factura') return new Response(JSON.stringify({ error: 'Doar facturile pot fi stornate' }), { status: 400 });
  if (parent.status === 'voided' || parent.status === 'reversed') return new Response(JSON.stringify({ error: 'Factura e deja stornată/anulată' }), { status: 400 });

  // Mirror parent lines with negative amounts (read before the transaction).
  const parentLines = await db.select().from(transportInvoiceLines)
    .where(eq(transportInvoiceLines.invoiceId, parent.id))
    .orderBy(asc(transportInvoiceLines.position));

  const stornoId = nanoid();
  const now = new Date();

  // Reserve number + insert storno header/lines + flip the parent's status in a
  // single transaction so a failure rolls back the reserved series number
  // (avoids gaps) and never leaves a storno without its parent reversal.
  let stornoFull = '';
  await db.transaction(async (tx) => {
    const series = await ensureDefaultSeries(parent.companyId, 'storno', null, tx);
    const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id, {}, tx);
    stornoFull = fullNumber;

    await tx.insert(transportInvoices).values({
      id: stornoId,
      companyId: parent.companyId,
      issuedByUserId: locals.user!.id,
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
      await tx.insert(transportInvoiceLines).values(parentLines.map((l) => ({
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

    // Reverse any stock the original invoice drew down — add it back to the same
    // warehouse(s)/quantities, recorded against the storno.
    const outMoves = await tx.select().from(stockMovements)
      .where(and(eq(stockMovements.refType, 'invoice'), eq(stockMovements.refId, parent.id), eq(stockMovements.kind, 'out')));
    for (const m of outMoves) {
      if (!m.productId || !m.warehouseId) continue;
      await applyStockIn(parent.companyId, m.warehouseId, m.productId, Number(m.quantity) || 0, Number(m.unitCostCents) || 0, { reason: `Storno ${stornoFull}`, refType: 'invoice', refId: stornoId, userId: locals.user!.id }, tx);
    }

    // Mark the parent 'reversed' (NOT 'voided'): the original stays a valid fiscal
    // document in declarations/SAF-T, and the storno (−) nets it to zero in the
    // period. 'voided' would wrongly drop it from declaratii while still counting
    // the negative storno → under-reporting.
    await tx.update(transportInvoices)
      .set({ status: 'reversed', updatedAt: now })
      .where(eq(transportInvoices.id, parent.id));
  });

  return new Response(JSON.stringify({ id: stornoId, fullNumber: stornoFull }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
