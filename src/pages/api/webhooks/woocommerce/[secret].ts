import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapWooOrderToInvoice, createInvoiceFromMappedOrder, verifyHmacBase64 } from '../../../../lib/connectors';

// WooCommerce "order.created" webhook receiver.
// Public + CSRF-exempt (handled by middleware for /api/webhooks/*).
// The [secret] path segment is ONLY a connection selector — it does NOT
// authenticate the request. Authentication is the WooCommerce HMAC over the raw
// body (X-WC-Webhook-Signature), verified below before any processing.
// We return 200 on benign skips so Woo doesn't disable the webhook, but a
// FAILED signature returns 401 (an unauthenticated caller must not be trusted).
const ok = (data: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const unauthorized = () =>
  new Response(JSON.stringify({ ok: false, error: 'invalid signature' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, request }) => {
  const secret = params.secret;
  if (!secret) return ok({ skipped: 'no_secret' });

  try {
    const [conn] = await db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.webhookSecret, secret))
      .limit(1);

    if (!conn) return ok({ skipped: 'unknown_connection' });
    if (!conn.isActive) return ok({ skipped: 'inactive' });

    // Read the raw body ONCE (needed verbatim for HMAC, then JSON.parse it).
    // Woo sometimes sends a webhook "ping" (test) with an empty/text body.
    const raw = await request.text().catch(() => '');

    // Verify WooCommerce HMAC over the raw body BEFORE any processing. Reject
    // 401 on mismatch. Key = per-connection webhookSecret (see connectors.ts).
    // Note: Woo's "Webhook created" ping is also signed with the same secret.
    const provided = request.headers.get('x-wc-webhook-signature');
    if (!verifyHmacBase64(raw, conn.webhookSecret || '', provided)) {
      return unauthorized();
    }

    // Always record that we received an event, even if we don't invoice.
    await db
      .update(integrationConnections)
      .set({ lastEventAt: new Date() })
      .where(eq(integrationConnections.id, conn.id))
      .catch(() => {});

    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });

    if (!raw || raw.trim().length === 0) return ok({ skipped: 'empty_body' });
    let order: any;
    try { order = JSON.parse(raw); } catch { return ok({ skipped: 'invalid_json' }); }

    // Only act on actual orders (ignore product/customer topics if mis-wired).
    if (!order || (!Array.isArray(order.line_items) && order.total == null)) {
      return ok({ skipped: 'not_an_order' });
    }

    const mapped = mapWooOrderToInvoice(order);
    const ref = mapped.externalOrderRef || order?.id || '';
    const note = `Comandă WooCommerce #${ref}`;
    const created = await createInvoiceFromMappedOrder(conn.companyId, null, mapped, note);

    return ok(created ? { invoiceId: created.id, fullNumber: created.fullNumber } : { skipped: 'invoice_not_created' });
  } catch {
    // Never 500 — return 200 so the sender stops retrying.
    return ok({ skipped: 'error' });
  }
};
