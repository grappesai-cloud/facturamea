// POST /api/invoicing/invoices/[id]/chitanta
// Generates a "chitanță" (receipt) document for an existing factură.
// Body: { amountCents, method?: 'cash'|'card'|'transfer', reference? }
// Records a transport_invoice_payments row AND emits a chitanță document
// numbered from the chitanta series, linked back via chitanta_for_invoice_id.

import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines, transportInvoicePayments } from '../../../../../db/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber } from '../../../../../lib/invoicing';
import { recomputeCompanyPaymentScore } from '../../../../../lib/payment-scoring';
import { requireRole } from '../../../../../lib/require-role';

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const id = params.id as string;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const amountCents = Math.round(Number(body.amountCents) || 0);
  if (amountCents <= 0) return new Response(JSON.stringify({ error: 'Sumă invalidă' }), { status: 400 });
  const method = body.method || 'cash';
  const reference = body.reference?.trim() || null;

  const [parent] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, id)).limit(1);
  if (!parent) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
  if (parent.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });
  if (parent.kind !== 'factura') return new Response(JSON.stringify({ error: 'Chitanța se emite doar pentru facturi' }), { status: 400 });
  if (parent.status === 'reversed' || parent.status === 'voided') return new Response(JSON.stringify({ error: 'Nu se poate încasa o factură stornată/anulată.' }), { status: 400 });

  const remaining = parent.totalCents - parent.paidCents;
  if (amountCents > remaining) return new Response(JSON.stringify({ error: `Sumă peste rest de plată (${remaining / 100})` }), { status: 400 });

  const now = new Date();
  const chitantaId = nanoid();

  // Record the payment, update the parent, reserve the chitanță number and
  // emit the chitanță document — all atomically. A failure rolls back the
  // consumed chitanță series number (no gaps).
  const emitted = await db.transaction(async (tx) => {
    // 1) Record the payment on the parent invoice.
    await tx.insert(transportInvoicePayments).values({
      id: nanoid(),
      invoiceId: parent.id,
      amountCents,
      currency: parent.currency,
      method,
      reference,
      receivedAt: now,
      recordedByUserId: locals.user!.id,
    });
    // Recompute paidCents from the authoritative SUM inside the tx (avoids the
    // stale-read lost-update race with a concurrent payment/chitanță).
    const [agg] = await tx.select({ sum: sql<number>`COALESCE(SUM(${transportInvoicePayments.amountCents}), 0)` })
      .from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, parent.id));
    const newPaidCents = Math.min(parent.totalCents, Number(agg?.sum) || 0);
    const newStatus = newPaidCents >= parent.totalCents ? 'paid' : 'partial';
    await tx.update(transportInvoices).set({
      paidCents: newPaidCents,
      status: newStatus,
      paidAt: newStatus === 'paid' ? now : parent.paidAt,
      updatedAt: now,
    }).where(eq(transportInvoices.id, parent.id));

    // 2) Emit a chitanță document.
    const series = await ensureDefaultSeries(parent.companyId, 'chitanta', null, tx);
    const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id, {}, tx);

    await tx.insert(transportInvoices).values({
      id: chitantaId,
      companyId: parent.companyId,
      issuedByUserId: locals.user!.id,
      seriesId: series.id,
      sequenceNumber,
      fullNumber,
      kind: 'chitanta',
      clientCompanyId: parent.clientCompanyId,
      clientExternalId: parent.clientExternalId,
      clientNameSnap: parent.clientNameSnap,
      clientTaxIdSnap: parent.clientTaxIdSnap,
      clientAddressSnap: parent.clientAddressSnap,
      orderId: parent.orderId,
      parentInvoiceId: parent.id,
      chitantaForInvoiceId: parent.id,
      modelId: parent.modelId,
      currency: parent.currency,
      vatRegime: 'standard',
      subtotalCents: amountCents,
      vatCents: 0,
      totalCents: amountCents,
      paidCents: amountCents,
      status: 'paid',
      issuedAt: now,
      paidAt: now,
      notes: `Chitanță pentru factura ${parent.fullNumber}${reference ? ` (ref: ${reference})` : ''}`,
    });

    await tx.insert(transportInvoiceLines).values({
      id: nanoid(),
      invoiceId: chitantaId,
      position: 0,
      description: `Încasare aferentă facturii ${parent.fullNumber}`,
      quantity: 1,
      unit: 'buc',
      unitPriceCents: amountCents,
      vatRate: 0,
      lineTotalCents: amountCents,
    });

    return { fullNumber };
  });
  const { fullNumber } = emitted;

  // Refresh the payer's payment-behavior score (best-effort) — a timely
  // payment improves their Payment Reliability Score.
  if (parent.clientCompanyId) {
    recomputeCompanyPaymentScore(parent.clientCompanyId).catch(() => {});
  }

  return new Response(JSON.stringify({ id: chitantaId, fullNumber }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
