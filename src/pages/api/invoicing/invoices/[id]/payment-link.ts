// POST /api/invoicing/invoices/[id]/payment-link
// Creates (or refreshes) a Stripe Checkout Session for the outstanding amount
// of an invoice so the client can pay it by card online. Stores the hosted
// link on the invoice and returns { url }.
//
// The Stripe webhook (/api/webhooks/stripe) records the payment back onto the
// invoice when checkout.session.completed fires with metadata.product='invoice'.

import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { getStripe, isStripeConfigured } from '../../../../../lib/stripe';
import { captureError } from '../../../../../lib/observability';

function resolveOrigin(requestUrl: string): string {
  const configured = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  try { return new URL(requestUrl).origin; } catch { return 'https://facturamea.com'; }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  const invoiceId = params.id as string;
  if (!cid || !invoiceId) return json({ error: 'Date lipsă' }, 400);

  if (!isStripeConfigured()) {
    return json({ error: 'Plățile online nu sunt configurate. Setează STRIPE_SECRET_KEY pentru a activa linkurile de plată.' }, 503);
  }
  const stripe = getStripe();
  if (!stripe) {
    return json({ error: 'Stripe indisponibil momentan. Încearcă din nou mai târziu.' }, 503);
  }

  let inv;
  try {
    [inv] = await db.select().from(transportInvoices)
      .where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, cid)))
      .limit(1);
  } catch {
    return json({ error: 'Eroare bază de date' }, 500);
  }
  if (!inv) return json({ error: 'Factură inexistentă' }, 404);

  if (inv.kind !== 'factura') {
    return json({ error: 'Linkul de plată este disponibil doar pentru facturi.' }, 400);
  }

  const outstanding = inv.totalCents - inv.paidCents;
  if (outstanding <= 0) {
    return json({ error: 'Factura este deja încasată integral.' }, 400);
  }

  const origin = resolveOrigin(request.url);
  const currency = (inv.currency || 'RON').toLowerCase();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: outstanding,
            product_data: { name: `Factura ${inv.fullNumber}` },
          },
        },
      ],
      metadata: { product: 'invoice', invoiceId, companyId: cid },
      success_url: `${origin}/app/facturare/${invoiceId}?plata=succes`,
      cancel_url: `${origin}/app/facturare/${invoiceId}?plata=anulata`,
    });
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: cid,
      route: '/api/invoicing/invoices/[id]/payment-link',
      method: 'POST',
      extra: { invoiceId },
    });
    return json({ error: 'Nu am putut crea linkul de plată. Încearcă din nou mai târziu.' }, 502);
  }

  if (!session.url) {
    return json({ error: 'Stripe nu a returnat un link de plată.' }, 502);
  }

  try {
    await db.update(transportInvoices).set({
      paymentLinkUrl: session.url,
      paymentLinkId: session.id,
      paymentLinkStatus: 'active',
      updatedAt: new Date(),
    }).where(eq(transportInvoices.id, invoiceId));
  } catch { /* link still usable even if persistence fails */ }

  return json({ url: session.url });
};
