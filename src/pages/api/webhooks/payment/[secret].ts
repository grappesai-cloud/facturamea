import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapGenericPaymentToInvoice, createInvoiceFromMappedOrder, verifyHmacBase64 } from '../../../../lib/connectors';

// Generic payment-source webhook. A processor (Netopia / PayU / EuPlătesc) — or
// a small adapter on the merchant's side — POSTs a normalized JSON payload on a
// confirmed payment, signed with base64(HMAC-SHA256(body, secret)) in
// `X-Webhook-Signature`. On success we issue an invoice for the amount.
//
// Expected payload:
//   { amount_cents | amount, currency?, customer_name?, customer_tax_id?,
//     description?, vat_rate?, reference? }
// `reference` makes re-deliveries idempotent (deduped on the invoice note).
const ok = (data: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const unauthorized = () =>
  new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, request }) => {
  const secret = params.secret;
  if (!secret) return ok({ skipped: 'no_secret' });

  try {
    const [conn] = await db.select().from(integrationConnections)
      .where(eq(integrationConnections.webhookSecret, secret)).limit(1);
    if (!conn) return ok({ skipped: 'unknown_connection' });
    if (!conn.isActive) return ok({ skipped: 'inactive' });

    const raw = await request.text().catch(() => '');
    const provided = request.headers.get('x-webhook-signature');
    if (!verifyHmacBase64(raw, conn.webhookSecret || '', provided)) return unauthorized();

    await db.update(integrationConnections).set({ lastEventAt: new Date() }).where(eq(integrationConnections.id, conn.id)).catch(() => {});
    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });
    if (!raw || raw.trim().length === 0) return ok({ skipped: 'empty_body' });

    let payload: any;
    try { payload = JSON.parse(raw); } catch { return ok({ skipped: 'invalid_json' }); }

    const mapped = mapGenericPaymentToInvoice(payload);
    if (!mapped) return ok({ skipped: 'no_amount' });
    const ref = mapped.externalOrderRef || '';
    const note = `Plată online ${conn.label || ''} ${ref}`.trim();
    const created = await createInvoiceFromMappedOrder(conn.companyId, null, mapped, note);
    return ok(created ? { invoiceId: created.id, fullNumber: created.fullNumber } : { skipped: 'invoice_not_created' });
  } catch {
    return ok({ skipped: 'error' });
  }
};
