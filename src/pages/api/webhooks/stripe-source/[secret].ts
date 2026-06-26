import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { getStripe, isStripeConfigured } from '../../../../lib/stripe';
import { decryptSecret } from '../../../../lib/crypto';
import { mapStripeEventToInvoice, createInvoiceFromMappedOrder } from '../../../../lib/connectors';

// "Stripe as a source": the client connects THEIR Stripe account and points a
// webhook here. On a successful payment we issue an invoice. Unlike the platform
// billing webhook (/api/webhooks/stripe, our own STRIPE_WEBHOOK_SECRET), this is
// per-connection: the signing secret is the client's, stored encrypted in
// config_enc. The [secret] path segment only selects the connection; the Stripe
// signature (verified with the client's signing secret) authenticates.
const ok = (data: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, request }) => {
  const secret = params.secret;
  if (!secret) return ok({ skipped: 'no_secret' });
  if (!isStripeConfigured()) return new Response('Stripe not configured', { status: 503 });

  const [conn] = await db.select().from(integrationConnections)
    .where(eq(integrationConnections.webhookSecret, secret)).limit(1);
  if (!conn) return ok({ skipped: 'unknown_connection' });
  if (!conn.isActive) return ok({ skipped: 'inactive' });
  if (conn.provider !== 'stripe') return ok({ skipped: 'wrong_provider' });

  // Per-connection Stripe signing secret (whsec_...) from config_enc.
  let signingSecret = '';
  try {
    const cfg = JSON.parse(decryptSecret(conn.configEnc || ''));
    signingSecret = String(cfg?.signingSecret || '');
  } catch { /* corrupt / missing */ }
  if (!signingSecret) return ok({ skipped: 'no_signing_secret' });

  const sig = request.headers.get('stripe-signature') || '';
  const raw = await request.text();
  let event: any;
  try {
    event = getStripe()!.webhooks.constructEvent(raw, sig, signingSecret);
  } catch (err) {
    // A failed signature is an unauthenticated caller — reject (Stripe expects 400).
    return new Response(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`, { status: 400 });
  }

  await db.update(integrationConnections).set({ lastEventAt: new Date() }).where(eq(integrationConnections.id, conn.id)).catch(() => {});
  if (!conn.autoInvoice) return ok({ skipped: 'auto_invoice_off' });

  const mapped = mapStripeEventToInvoice(event);
  if (!mapped) return ok({ skipped: `ignored_event:${event.type}` });

  const note = `Plată Stripe ${mapped.externalOrderRef ?? ''}`.trim();
  const created = await createInvoiceFromMappedOrder(conn.companyId, null, mapped, note);
  return ok(created ? { invoiceId: created.id, fullNumber: created.fullNumber } : { skipped: 'invoice_not_created' });
};
