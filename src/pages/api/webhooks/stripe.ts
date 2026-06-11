import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { auditLog } from '../../../db/schema';
import { nanoid } from 'nanoid';
import { getStripe, isStripeConfigured } from '../../../lib/stripe';
import { grantLifetime } from '../../../lib/license';

// Stripe webhook receiver. Configure in Stripe dashboard:
//   Developers → Webhooks → Add endpoint
//   URL: https://facturamea.com/api/webhooks/stripe
//   Events: checkout.session.completed
//   Then copy the signing secret to STRIPE_WEBHOOK_SECRET env var.
//
// Reads the raw body; middleware CSRF check skips /api/webhooks/*.
export const POST: APIRoute = async ({ request }) => {
  if (!isStripeConfigured()) return new Response('Stripe not configured', { status: 503 });
  const stripe = getStripe()!;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('STRIPE_WEBHOOK_SECRET missing', { status: 503 });

  const sig = request.headers.get('stripe-signature') || '';
  const raw = await request.text();
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`, { status: 400 });
  }

  try {
    await db.insert(auditLog).values({
      id: nanoid(), action: `stripe.${event.type}`, entityType: 'stripe_event', entityId: event.id,
      metadata: JSON.stringify({ type: event.type, livemode: event.livemode }),
    } as any);
  } catch {}

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any;
    const companyId = session.metadata?.companyId || session.client_reference_id;
    const product = session.metadata?.product || '';
    if (companyId && product === 'lifetime' && session.payment_status === 'paid') {
      try {
        await grantLifetime(companyId, {
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent,
          amountCents: session.amount_total,
        });
      } catch (err) {
        console.error('grantLifetime failed', err);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
};
