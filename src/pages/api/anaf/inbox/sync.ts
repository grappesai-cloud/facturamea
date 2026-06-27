// POST /api/anaf/inbox/sync — pulls received e-Factura messages from ANAF SPV
// for the current company and upserts them into efactura_inbox (dedupe on
// (companyId, anafMsgId)). Returns { ok, synced, total } or { ok:false, error }.
//
// Guarded: never 500s when ANAF is unconfigured. If the company is not
// connected, returns { ok:false, error } with a clear Romanian message.
import type { APIRoute } from 'astro';
import { getAnafStatus } from '../../../../lib/anaf/tokens';
import { syncInboxForCompany } from '../../../../lib/anaf/inbox-sync';
import { requireRole } from '../../../../lib/require-role';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals }) => {
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  let anaf: { connected: boolean; cif: string | null };
  try {
    anaf = await getAnafStatus(companyId);
  } catch {
    anaf = { connected: false, cif: null };
  }
  if (!anaf.connected || !anaf.cif) {
    return json({ ok: false, error: 'ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.' });
  }

  const r = await syncInboxForCompany(companyId, anaf.cif);
  if (!r.ok) return json({ ok: false, error: r.error });
  return json({ ok: true, synced: r.synced, total: r.total });
};
