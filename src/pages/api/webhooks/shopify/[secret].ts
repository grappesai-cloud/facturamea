import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapShopifyOrderToInvoice, createInvoiceFromMappedOrder } from '../../../../lib/connectors';

// Shopify "Order creation" webhook receiver.
// Public + CSRF-exempt (handled by middleware for /api/webhooks/*).
// We ALWAYS return 200 quickly — Shopify retries on non-2xx and disables the
// webhook after repeated failures. Errors are swallowed by design.
const ok = (data: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

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

    await db
      .update(integrationConnections)
      .set({ lastEventAt: new Date() })
      .where(eq(integrationConnections.id, conn.id))
      .catch(() => {});

    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });

    const raw = await request.text().catch(() => '');
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
