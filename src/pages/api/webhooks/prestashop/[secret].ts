import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapPrestaShopOrderToInvoice, createInvoiceFromMappedOrder, verifyHmacBase64 } from '../../../../lib/connectors';

// PrestaShop order webhook receiver (via a webhook module that signs the raw
// body with base64(HMAC-SHA256(body, secret)) in `X-Webhook-Signature`).
// Public + CSRF-exempt (middleware handles /api/webhooks/*). The [secret] path
// segment selects the connection; the HMAC authenticates the request.
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
    const provided = request.headers.get('x-webhook-signature') || request.headers.get('x-prestashop-signature');
    if (!verifyHmacBase64(raw, conn.webhookSecret || '', provided)) return unauthorized();

    await db.update(integrationConnections).set({ lastEventAt: new Date() }).where(eq(integrationConnections.id, conn.id)).catch(() => {});
    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });
    if (!raw || raw.trim().length === 0) return ok({ skipped: 'empty_body' });

    let order: any;
    try { order = JSON.parse(raw); } catch { return ok({ skipped: 'invalid_json' }); }
    if (!order || (!Array.isArray(order.products) && !Array.isArray(order.order_rows) && order.total_paid == null)) {
      return ok({ skipped: 'not_an_order' });
    }

    const mapped = mapPrestaShopOrderToInvoice(order);
    const ref = mapped.externalOrderRef || order?.id || '';
    const note = `Comandă PrestaShop #${ref}`;
    const created = await createInvoiceFromMappedOrder(conn.companyId, null, mapped, note);
    return ok(created ? { invoiceId: created.id, fullNumber: created.fullNumber } : { skipped: 'invoice_not_created' });
  } catch {
    return ok({ skipped: 'error' });
  }
};
