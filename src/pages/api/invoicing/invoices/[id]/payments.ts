import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoicePayments } from '../../../../../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Record a partial / full payment against an invoice. Updates aggregate state
// (paidCents, paidAt, status: paid|partial) atomically inside a transaction.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const invoiceId = params.id as string;
  if (!cid || !invoiceId) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({}));
  const amount = Math.round(Number(body.amountCents) || 0);
  if (amount <= 0) return new Response(JSON.stringify({ error: 'Suma trebuie pozitivă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices).where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, cid))).limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });

  const newPaid = inv.paidCents + amount;
  const fullyPaid = newPaid >= inv.totalCents;
  const newStatus = fullyPaid ? 'paid' : 'partial';

  await db.insert(transportInvoicePayments).values({
    id: nanoid(),
    invoiceId,
    amountCents: amount,
    currency: inv.currency,
    method: body.method || null,
    reference: body.reference || null,
    receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    recordedByUserId: locals.user.id,
    notes: body.notes || null,
  });

  await db.update(transportInvoices)
    .set({
      paidCents: newPaid,
      paidAt: fullyPaid ? new Date() : inv.paidAt,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(transportInvoices.id, invoiceId));

  return new Response(JSON.stringify({ paidCents: newPaid, status: newStatus }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
