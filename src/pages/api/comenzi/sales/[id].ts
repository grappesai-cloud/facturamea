// Single sales order: GET (with lines), PATCH (status change + action='invoice'),
// DELETE. The 'invoice' action turns the order into a real factură using the
// company's default invoice series, then links it back via salesOrders.invoiceId.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import {
  salesOrders, salesOrderLines, invoiceClients,
  transportInvoices, transportInvoiceLines,
} from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT } from '../../../../lib/invoicing';

const VALID_STATUS = ['draft', 'confirmed', 'invoiced', 'delivered', 'canceled'];

async function loadOrder(cid: string, id: string) {
  const [order] = await db.select().from(salesOrders)
    .where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, cid))).limit(1);
  if (!order) return null;
  const lines = await db.select().from(salesOrderLines)
    .where(eq(salesOrderLines.orderId, id));
  return { order, lines };
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    const data = await loadOrder(cid, id);
    if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let data;
  try {
    data = await loadOrder(cid, id);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
  if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
  const { order, lines } = data;

  // ── action='invoice' → emit a factură from this sales order ──
  if (body.action === 'invoice') {
    if (order.status === 'invoiced' && order.invoiceId) {
      return new Response(JSON.stringify({ error: 'Comanda e deja facturată', invoiceId: order.invoiceId }), { status: 400 });
    }
    if (order.status === 'canceled') {
      return new Response(JSON.stringify({ error: 'Comanda e anulată' }), { status: 400 });
    }
    if (!lines.length) return new Response(JSON.stringify({ error: 'Comanda nu are linii' }), { status: 400 });

    try {
      // Resolve client snapshot from the linked external client when present.
      let clientTaxId: string | null = null;
      let clientAddress: string | null = null;
      if (order.clientExternalId) {
        const [c] = await db.select().from(invoiceClients)
          .where(and(eq(invoiceClients.id, order.clientExternalId), eq(invoiceClients.ownerCompanyId, cid))).limit(1);
        if (c) {
          clientTaxId = c.taxId || null;
          clientAddress = [c.address, c.city, c.county, c.country].filter(Boolean).join(', ') || null;
        }
      }

      // Compute invoice totals from the order lines.
      let subtotalCents = 0;
      let vatCents = 0;
      const computed = lines.map((l, idx) => {
        const q = Number(l.quantity) || 0;
        const up = Math.round(Number(l.unitPriceCents) || 0);
        const lineSub = Math.round(q * up);
        const rate = Math.max(0, Number(l.vatRate) || 0);
        const lineVat = Math.round((lineSub * rate) / 100);
        subtotalCents += lineSub;
        vatCents += lineVat;
        return {
          id: nanoid(),
          position: idx,
          code: null as string | null,
          description: l.name,
          quantity: q,
          unit: 'buc',
          unitPriceCents: up,
          vatRate: rate,
          lineTotalCents: lineSub + lineVat,
        };
      });
      const totalCents = subtotalCents + vatCents;

      const series = await ensureDefaultSeries(cid, 'factura', order.clientExternalId ? 'external' : null);
      const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id, INVOICE_NUMBER_FORMAT);

      const invoiceId = nanoid();
      const now = new Date();
      await db.insert(transportInvoices).values({
        id: invoiceId,
        companyId: cid,
        issuedByUserId: locals.user.id,
        seriesId: series.id,
        sequenceNumber,
        fullNumber,
        kind: 'factura',
        clientExternalId: order.clientExternalId || null,
        clientNameSnap: order.clientNameSnap || 'Client',
        clientTaxIdSnap: clientTaxId,
        clientAddressSnap: clientAddress,
        currency: (order.currency || 'RON').toUpperCase().slice(0, 5),
        vatRegime: 'standard',
        subtotalCents,
        vatCents,
        totalCents,
        paidCents: 0,
        status: 'issued',
        issuedAt: now,
        dueAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        language: 'ro',
        precision: 2,
        notes: `Generată din comanda ${order.number}`,
      } as any);

      if (computed.length) {
        await db.insert(transportInvoiceLines).values(computed.map((l) => ({ ...l, invoiceId })) as any);
      }

      await db.update(salesOrders)
        .set({ status: 'invoiced', invoiceId })
        .where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, cid)));

      return new Response(JSON.stringify({ ok: true, invoiceId, fullNumber, totalCents }), { headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ error: 'Nu s-a putut emite factura' }), { status: 500 });
    }
  }

  // ── plain status change ──
  const next = String(body.status || '').trim();
  if (!VALID_STATUS.includes(next)) return new Response(JSON.stringify({ error: 'Status invalid' }), { status: 400 });
  try {
    await db.update(salesOrders).set({ status: next })
      .where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, status: next }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    const [order] = await db.select({ status: salesOrders.status }).from(salesOrders)
      .where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, cid))).limit(1);
    if (!order) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
    if (order.status === 'invoiced') return new Response(JSON.stringify({ error: 'Comanda facturată nu poate fi ștearsă' }), { status: 400 });
    await db.delete(salesOrders).where(and(eq(salesOrders.id, id), eq(salesOrders.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
