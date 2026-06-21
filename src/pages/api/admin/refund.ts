import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appLicenses } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { getStripe } from '../../../lib/stripe';
import { logAction } from '../../../lib/audit';

function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

// Refund a company's lifetime payment via Stripe, then deactivate the license.
export const POST: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Date invalide' }), { status: 400 }); }
  const companyId = String(body.companyId || '').trim();
  if (!companyId) return new Response(JSON.stringify({ error: 'companyId lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const [lic] = await db.select().from(appLicenses).where(eq(appLicenses.companyId, companyId));
  if (!lic || lic.plan !== 'lifetime') {
    return new Response(JSON.stringify({ error: 'Nicio plată lifetime de rambursat pentru această companie.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let refunded = false;
  const stripe = getStripe();
  if (stripe && (lic as any).stripePaymentIntentId) {
    try {
      await stripe.refunds.create({ payment_intent: (lic as any).stripePaymentIntentId });
      refunded = true;
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Stripe a refuzat rambursarea: ' + (e?.message || 'eroare') }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Deactivate the license (plan back to non-lifetime → account is gated again).
  await db.update(appLicenses).set({ plan: 'trial', status: 'refunded', updatedAt: new Date() } as any).where(eq(appLicenses.companyId, companyId));
  try { await logAction({ userId: (locals.user as any).id, companyId, action: 'admin.refund', entityType: 'license', entityId: companyId, metadata: { refunded }, request }); } catch {}

  return new Response(JSON.stringify({ ok: true, refunded }), { headers: { 'Content-Type': 'application/json' } });
};
