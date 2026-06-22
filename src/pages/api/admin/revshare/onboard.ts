import type { APIRoute } from 'astro';
import { getStripe } from '../../../../lib/stripe';
import { getRevShareConfig, setRevShareSetting, RS_KEYS } from '../../../../lib/revenue-share';
import { appOrigin } from '../../../../lib/oauth';

function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

// Creează (sau refolosește) contul Connect Express al asociatului și întoarce
// un link de onboarding Stripe (date firmă + cont bancar). Admin-only.
export const POST: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  const stripe = getStripe();
  if (!stripe) return new Response(JSON.stringify({ error: 'Stripe neconfigurat' }), { status: 503, headers: { 'Content-Type': 'application/json' } });

  const cfg = await getRevShareConfig();
  let accountId = cfg.accountId;

  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'RO',
        capabilities: { transfers: { requested: true } },
        business_profile: { product_description: 'Revenue share partener facturamea' },
        metadata: { role: 'facturamea_associate' },
      });
      accountId = account.id;
      await setRevShareSetting(RS_KEYS.accountId, accountId);
    }

    const origin = appOrigin(request.url);
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/admin/revshare?onboard=refresh`,
      return_url: `${origin}/admin/revshare?onboard=done`,
      type: 'account_onboarding',
    });

    return new Response(JSON.stringify({ accountId, url: link.url }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Cel mai frecvent: Connect neactivat pe contul platformă.
    const hint = /connect/i.test(msg) || /not.*enabled/i.test(msg)
      ? 'Activează Stripe Connect în Dashboard (Settings → Connect) și acceptă termenii, apoi reîncearcă.'
      : '';
    return new Response(JSON.stringify({ error: msg, hint }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
};
