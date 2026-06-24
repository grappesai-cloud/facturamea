import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoicePayments } from '../../../../../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../../lib/require-role';

// Record a partial / full payment against an invoice. Updates aggregate state
// (paidCents, paidAt, status: paid|partial) atomically inside a transaction.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const cid = locals.user.companyId;
  const invoiceId = params.id as string;
  if (!cid || !invoiceId) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({}));
  const amount = Math.round(Number(body.amountCents) || 0);
  if (amount <= 0) return new Response(JSON.stringify({ error: 'Suma trebuie pozitivă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices).where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, cid))).limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });
  if (inv.status === 'reversed' || inv.status === 'voided') return new Response(JSON.stringify({ error: 'Nu se poate înregistra încasare pe o factură stornată/anulată.' }), { status: 400 });

  // Payment currency must match the invoice currency (no implicit FX).
  const payCurrency = (body.currency || inv.currency || 'RON').toUpperCase();
  if (payCurrency !== (inv.currency || 'RON').toUpperCase()) {
    return new Response(JSON.stringify({ error: `Moneda plății (${payCurrency}) diferă de moneda facturii (${inv.currency}).` }), { status: 400 });
  }

  // Cap: total payments may not exceed the invoice total (no overpayment).
  const remaining = inv.totalCents - inv.paidCents;
  if (amount > remaining) {
    return new Response(JSON.stringify({ error: `Sumă peste rest de plată (${remaining / 100})` }), { status: 400 });
  }

  // Reserve + aggregate atomically: recompute paidCents from the authoritative
  // SUM of existing payments + the new one, all inside one transaction.
  const result = await db.transaction(async (tx) => {
    await tx.insert(transportInvoicePayments).values({
      id: nanoid(),
      invoiceId,
      amountCents: amount,
      currency: inv.currency,
      method: body.method || null,
      reference: body.reference || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
      recordedByUserId: locals.user!.id,
      notes: body.notes || null,
    }).onConflictDoNothing(); // idempotent on (invoice, reference) — no 500 on a duplicate OP/ref

    const [agg] = await tx
      .select({ sum: sql<number>`COALESCE(SUM(${transportInvoicePayments.amountCents}), 0)` })
      .from(transportInvoicePayments)
      .where(eq(transportInvoicePayments.invoiceId, invoiceId));
    const newPaid = Number(agg?.sum ?? 0);
    const fullyPaid = newPaid >= inv.totalCents;
    const newStatus = fullyPaid ? 'paid' : 'partial';

    await tx.update(transportInvoices)
      .set({
        paidCents: newPaid,
        paidAt: fullyPaid ? new Date() : inv.paidAt,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(transportInvoices.id, invoiceId));

    return { newPaid, newStatus };
  });

  return new Response(JSON.stringify({ paidCents: result.newPaid, status: result.newStatus }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
