// POST /api/plata/netopia/[invoiceId]
// Starts a Netopia (mobilPay) card payment for the outstanding amount of an
// invoice. Stores the hosted-page link on the invoice and returns { url }.
//
// The Netopia IPN (/api/webhooks/netopia/[invoiceId]) records the payment back
// onto the invoice when the payment is confirmed.
//
// Requires a session (middleware enforces auth for /api/plata/*). Degrades to a
// clear 503 when Netopia credentials are not configured.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { createNetopiaPayment, isNetopiaConfigured } from '../../../../lib/netopia';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function resolveOrigin(requestUrl: string): string {
  const configured = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  try { return new URL(requestUrl).origin; } catch { return 'https://facturamea.com'; }
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  const invoiceId = params.invoiceId as string;
  if (!cid || !invoiceId) return json({ error: 'Date lipsă' }, 400);

  if (!isNetopiaConfigured()) {
    return json(
      { error: 'Plata cu cardul prin Netopia nu este configurată. Setează NETOPIA_API_KEY și NETOPIA_SIGNATURE pentru a activa linkurile de plată.' },
      503,
    );
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
  const returnUrl = `${origin}/app/facturare/${invoiceId}?plata=netopia`;
  const confirmUrl = `${origin}/api/webhooks/netopia/${invoiceId}`;

  const result = await createNetopiaPayment({
    orderId: invoiceId,
    amountCents: outstanding,
    currency: inv.currency || 'RON',
    description: `Factura ${inv.fullNumber}`,
    returnUrl,
    confirmUrl,
    billing: { email: locals.user.email },
  });

  if (!result.ok || !result.redirectUrl) {
    return json({ error: result.error || 'Nu am putut crea linkul de plată Netopia.' }, 502);
  }

  try {
    await db.update(transportInvoices).set({
      paymentLinkUrl: result.redirectUrl,
      paymentLinkId: result.ntpId ? `netopia:${result.ntpId}` : 'netopia',
      paymentLinkStatus: 'active',
      updatedAt: new Date(),
    }).where(eq(transportInvoices.id, invoiceId));
  } catch { /* link still usable even if persistence fails */ }

  return json({ url: result.redirectUrl });
};
