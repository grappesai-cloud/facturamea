import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { auditLog, transportInvoices, transportInvoicePayments } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
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
    } else if (product === 'invoice' && session.payment_status === 'paid') {
      // Online invoice payment via the per-invoice Checkout link.
      const invoiceId = session.metadata?.invoiceId;
      const invCompanyId = session.metadata?.companyId || companyId;
      const amountCents = Math.round(Number(session.amount_total) || 0);
      if (invoiceId && invCompanyId && amountCents > 0) {
        try {
          const [inv] = await db.select().from(transportInvoices)
            .where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, invCompanyId)))
            .limit(1);
          if (inv) {
            // Idempotency: skip if we already recorded this Checkout session.
            const existing = await db.select().from(transportInvoicePayments)
              .where(and(eq(transportInvoicePayments.invoiceId, invoiceId), eq(transportInvoicePayments.reference, session.id)))
              .limit(1);
            if (existing.length === 0) {
              const newPaid = Math.min(inv.totalCents, inv.paidCents + amountCents);
              const fullyPaid = newPaid >= inv.totalCents;
              await db.insert(transportInvoicePayments).values({
                id: nanoid(),
                invoiceId,
                amountCents,
                currency: inv.currency,
                method: 'card',
                reference: session.id,
                receivedAt: new Date(),
                recordedByUserId: null,
                notes: 'Plată online card (Stripe)',
              } as any);
              await db.update(transportInvoices).set({
                paidCents: newPaid,
                status: fullyPaid ? 'paid' : 'partial',
                paidAt: fullyPaid ? new Date() : inv.paidAt,
                paymentLinkStatus: 'paid',
                updatedAt: new Date(),
              } as any).where(eq(transportInvoices.id, invoiceId));
            }
          }
        } catch (err) {
          console.error('invoice payment record failed', err);
        }
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
};
