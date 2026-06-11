import type { APIRoute } from 'astro';
import { getStripe, isStripeConfigured } from '../../../lib/stripe';
import { LIFETIME_PRICE_CENTS, LIFETIME_CURRENCY, licenseState } from '../../../lib/license';
import { appOrigin } from '../../../lib/oauth';

// Create a one-time Stripe Checkout session for the 700 RON lifetime plan.
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.companyId) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  if (!isStripeConfigured()) {
    return new Response(JSON.stringify({ error: 'Plățile nu sunt configurate momentan.' }), { status: 503 });
  }

  // Already lifetime? Nothing to buy.
  try {
    const st = await licenseState(user.companyId);
    if (st.plan === 'lifetime' && st.active) {
      return new Response(JSON.stringify({ error: 'Ai deja licența pe viață.' }), { status: 400 });
    }
  } catch {}

  const stripe = getStripe()!;
  const origin = appOrigin(request.url);
  const priceId = process.env.STRIPE_LIFETIME_PRICE_ID;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: LIFETIME_CURRENCY.toLowerCase(),
                unit_amount: LIFETIME_PRICE_CENTS,
                product_data: {
                  name: 'facturamea — Licență pe viață',
                  description: 'Acces complet, o singură plată. Facturare, e-Factura, gestiune, cheltuieli, POS.',
                },
              },
            },
      ],
      customer_email: user.email,
      client_reference_id: user.companyId,
      metadata: { companyId: user.companyId, userId: user.id, product: 'lifetime' },
      success_url: `${origin}/app/setari/abonament?status=success`,
      cancel_url: `${origin}/app/setari/abonament?status=cancel`,
      allow_promotion_codes: true,
    });
    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Nu am putut crea sesiunea de plată.' }), { status: 500 });
  }
};
