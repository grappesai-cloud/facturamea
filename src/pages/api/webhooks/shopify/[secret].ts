import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapShopifyOrderToInvoice, createInvoiceFromMappedOrder, verifyHmacBase64 } from '../../../../lib/connectors';

// Shopify "Order creation" webhook receiver.
// Public + CSRF-exempt (handled by middleware for /api/webhooks/*).
// The [secret] path segment is ONLY a connection selector — it does NOT
// authenticate the request. Authentication is the Shopify HMAC over the raw
// body (X-Shopify-Hmac-Sha256), verified below before any processing.
// We return 200 on benign skips so Shopify doesn't disable the webhook, but a
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
    const raw = await request.text().catch(() => '');

    // Verify Shopify HMAC over the raw body BEFORE any processing. Reject 401
    // on mismatch. Key = per-connection webhookSecret (see connectors.ts).
    const provided = request.headers.get('x-shopify-hmac-sha256');
    if (!verifyHmacBase64(raw, conn.webhookSecret || '', provided)) {
      return unauthorized();
    }

    await db
      .update(integrationConnections)
      .set({ lastEventAt: new Date() })
      .where(eq(integrationConnections.id, conn.id))
      .catch(() => {});

    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });

    if (!raw || raw.trim().length === 0) return ok({ skipped: 'empty_body' });
    let order: any;
    try { order = JSON.parse(raw); } catch { return ok({ skipped: 'invalid_json' }); }

    if (!order || (!Array.isArray(order.line_items) && order.total_price == null)) {
      return ok({ skipped: 'not_an_order' });
    }

    const mapped = mapShopifyOrderToInvoice(order);
    const ref = mapped.externalOrderRef || order?.id || '';
    const note = `Comandă Shopify ${String(ref).startsWith('#') ? ref : '#' + ref}`;
    const created = await createInvoiceFromMappedOrder(conn.companyId, null, mapped, note);

    return ok(created ? { invoiceId: created.id, fullNumber: created.fullNumber } : { skipped: 'invoice_not_created' });
  } catch {
    return ok({ skipped: 'error' });
  }
};
