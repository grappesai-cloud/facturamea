import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appLicenses, revenueSharePayouts } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
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

  // Reverse the revenue-share transfer(s) to the associate — otherwise a refund
  // leaks the 20% that was already paid out on this sale.
  let reversedShareCents = 0;
  if (stripe) {
    try {
      const payouts = await db.select().from(revenueSharePayouts)
        .where(and(eq(revenueSharePayouts.companyId, companyId), eq(revenueSharePayouts.status, 'paid')));
      for (const p of payouts) {
        if (!(p as any).stripeTransferId) continue;
        try {
          await stripe.transfers.createReversal((p as any).stripeTransferId, { amount: p.amountCents });
          await db.update(revenueSharePayouts).set({ status: 'reversed' } as any).where(eq(revenueSharePayouts.id, p.id));
          reversedShareCents += p.amountCents;
        } catch (e) { console.error('revshare reversal failed for transfer', (p as any).stripeTransferId, e); }
      }
    } catch (e) { console.error('revshare reversal lookup failed', e); }
  }

  // Deactivate the license (plan back to non-lifetime → account is gated again).
  await db.update(appLicenses).set({ plan: 'trial', status: 'refunded', updatedAt: new Date() } as any).where(eq(appLicenses.companyId, companyId));
  try { await logAction({ userId: (locals.user as any).id, companyId, action: 'admin.refund', entityType: 'license', entityId: companyId, metadata: { refunded, reversedShareCents }, request }); } catch {}

  return new Response(JSON.stringify({ ok: true, refunded, reversedShareCents }), { headers: { 'Content-Type': 'application/json' } });
};
