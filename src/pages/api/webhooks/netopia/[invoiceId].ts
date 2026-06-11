// POST /api/webhooks/netopia/[invoiceId]  (public, CSRF-exempt)
// Netopia (mobilPay) IPN receiver. When the payment is confirmed we record a
// transportInvoicePayments row, bump the invoice paidCents + status, and mark
// the payment link as paid. Idempotent on the Netopia reference.
//
// Configure the notify/IPN URL when starting the payment (see
// /api/plata/netopia/[invoiceId]); Netopia posts here server-to-server.
//
// IMPORTANT: always return 200 so Netopia does not retry forever on our own
// internal errors. We log and swallow.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoicePayments, auditLog } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { verifyNetopiaCallback, isNetopiaConfigured } from '../../../../lib/netopia';

const ok = (body: unknown = { received: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// Netopia may POST application/json (v2) or x-www-form-urlencoded with a
// `data` (and `env_key`) field (legacy). Parse both into an object.
async function parseBody(request: Request): Promise<any> {
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      return await request.json();
    }
    const raw = await request.text();
    if (!raw) return {};
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      const obj: Record<string, string> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      // The legacy IPN nests payment status in a `data` field; try to JSON-parse it.
      if (obj.data) {
        try { return { ...obj, ...JSON.parse(obj.data) }; } catch { return obj; }
      }
      return obj;
    }
    // Unknown content-type: try JSON, fall back to raw text wrapper.
    try { return JSON.parse(raw); } catch { return { raw }; }
  } catch {
    return {};
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const invoiceId = params.invoiceId as string;

  // Even unconfigured, acknowledge so Netopia stops retrying. Nothing to record.
  if (!isNetopiaConfigured()) return ok({ received: true, configured: false });

  const body = await parseBody(request);
  const cb = verifyNetopiaCallback(body);

  // Audit every IPN hit (best-effort).
  try {
    await db.insert(auditLog).values({
      id: nanoid(),
      action: 'netopia.ipn',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: JSON.stringify({ ok: cb.ok, status: cb.status, paid: cb.paid, ntpId: cb.ntpId }),
    } as any);
  } catch {}

  // Signature mismatch or invalid payload — acknowledge but do nothing.
  if (!cb.ok) return ok({ received: true, error: cb.error });
  if (!cb.paid) return ok({ received: true, paid: false });

  // The reference we dedupe on: prefer Netopia's payment id, else the invoice.
  const reference = (cb.ntpId ? `netopia:${cb.ntpId}` : `netopia:${invoiceId}`).slice(0, 80);

  try {
    const [inv] = await db.select().from(transportInvoices)
      .where(eq(transportInvoices.id, invoiceId))
      .limit(1);
    if (!inv) return ok({ received: true, error: 'invoice not found' });

    // Idempotency: skip if we already recorded this Netopia payment.
    const existing = await db.select().from(transportInvoicePayments)
      .where(and(eq(transportInvoicePayments.invoiceId, invoiceId), eq(transportInvoicePayments.reference, reference)))
      .limit(1);
    if (existing.length > 0) return ok({ received: true, duplicate: true });

    // Amount: trust the invoice outstanding, but never exceed it. If Netopia
    // reported an amount, prefer it (capped); else settle the full outstanding.
    const outstanding = Math.max(0, inv.totalCents - inv.paidCents);
    if (outstanding <= 0) {
      // Already fully paid; just flag the link.
      await db.update(transportInvoices).set({ paymentLinkStatus: 'paid', updatedAt: new Date() })
        .where(eq(transportInvoices.id, invoiceId));
      return ok({ received: true, alreadyPaid: true });
    }
    const reported = cb.amountCents != null && cb.amountCents > 0 ? cb.amountCents : outstanding;
    const amountCents = Math.min(reported, outstanding);

    const newPaid = Math.min(inv.totalCents, inv.paidCents + amountCents);
    const fullyPaid = newPaid >= inv.totalCents;

    await db.insert(transportInvoicePayments).values({
      id: nanoid(),
      invoiceId,
      amountCents,
      currency: cb.currency || inv.currency || 'RON',
      method: 'card',
      reference,
      receivedAt: new Date(),
      recordedByUserId: null,
      notes: 'Plată online card (Netopia / mobilPay)',
    } as any);

    await db.update(transportInvoices).set({
      paidCents: newPaid,
      status: fullyPaid ? 'paid' : 'partial',
      paidAt: fullyPaid ? new Date() : inv.paidAt,
      paymentLinkStatus: 'paid',
      updatedAt: new Date(),
    } as any).where(eq(transportInvoices.id, invoiceId));

    return ok({ received: true, recorded: true, fullyPaid });
  } catch (err) {
    console.error('netopia IPN record failed', err);
    // Still 200 so Netopia doesn't hammer us; we logged it.
    return ok({ received: true, error: 'internal' });
  }
};
