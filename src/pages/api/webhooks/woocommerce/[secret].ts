import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { mapWooOrderToInvoice, createInvoiceFromMappedOrder } from '../../../../lib/connectors';

// WooCommerce "order.created" webhook receiver.
// Public + CSRF-exempt (handled by middleware for /api/webhooks/*).
// We ALWAYS return 200 quickly — Woo retries aggressively on non-2xx, which
// would spam us on a transient failure. Errors are swallowed by design.
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

    // Always record that we received an event, even if we don't invoice.
    await db
      .update(integrationConnections)
      .set({ lastEventAt: new Date() })
      .where(eq(integrationConnections.id, conn.id))
      .catch(() => {});

    if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });

    // Woo sometimes sends a webhook "ping" (test) with an empty/text body.
    const raw = await request.text().catch(() => '');
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
