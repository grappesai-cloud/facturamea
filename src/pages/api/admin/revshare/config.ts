import type { APIRoute } from 'astro';
import { getRevShareConfig, setRevShareSetting, RS_KEYS, type RevShareBase } from '../../../../lib/revenue-share';

function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

const BASES: RevShareBase[] = ['gross', 'net_after_fee', 'net_after_vat'];

// Setează enabled / procent (bps) / bază. Admin-only.
export const POST: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Date invalide' }), { status: 400 }); }

  if (typeof body.enabled === 'boolean') {
    await setRevShareSetting(RS_KEYS.enabled, body.enabled ? 'true' : 'false');
  }
  if (body.bps != null) {
    const bps = Math.min(10000, Math.max(0, Math.round(Number(body.bps) || 0)));
    if (bps > 0) await setRevShareSetting(RS_KEYS.bps, String(bps));
  }
  if (body.base && BASES.includes(body.base)) {
    await setRevShareSetting(RS_KEYS.base, body.base);
  }

  const cfg = await getRevShareConfig();
  // Nu lăsa activarea fără cont onboardat să pară funcțională.
  return new Response(JSON.stringify({ ok: true, config: cfg, warning: cfg.enabled && !cfg.accountId ? 'Activat dar fără cont asociat onboardat — transferurile vor fi marcate „skipped" până faci onboarding.' : null }), { headers: { 'Content-Type': 'application/json' } });
};
