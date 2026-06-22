import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { revenueSharePayouts } from '../../../../db/schema';
import { desc } from 'drizzle-orm';
import { getStripe } from '../../../../lib/stripe';
import { getRevShareConfig } from '../../../../lib/revenue-share';

function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

// Starea curentă a revenue share: config + cont Connect + ultimele transferuri.
export const GET: APIRoute = async ({ locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  const cfg = await getRevShareConfig();

  let account: any = null;
  if (cfg.accountId) {
    const stripe = getStripe();
    if (stripe) {
      try {
        const a = await stripe.accounts.retrieve(cfg.accountId);
        account = {
          id: a.id,
          chargesEnabled: a.charges_enabled,
          payoutsEnabled: a.payouts_enabled,
          detailsSubmitted: a.details_submitted,
          requirementsDue: (a.requirements?.currently_due || []).length,
        };
      } catch (e: any) {
        account = { id: cfg.accountId, error: String(e?.message || e) };
      }
    }
  }

  let payouts: any[] = [];
  try {
    payouts = await db.select().from(revenueSharePayouts).orderBy(desc(revenueSharePayouts.createdAt)).limit(25);
  } catch { payouts = []; }

  return new Response(JSON.stringify({ config: cfg, account, payouts }), { headers: { 'Content-Type': 'application/json' } });
};
