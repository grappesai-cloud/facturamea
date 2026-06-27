// POST /api/banca/reconcile/auto  { accountId?: string }
// Auto-reconciles every unreconciled bank transaction whose match is
// high-confidence and unambiguous. Returns counts; ambiguous/medium ones are
// left for the manual per-transaction flow, and no-candidate ones are reported
// as "missing document".
import type { APIRoute } from 'astro';
import { requireRole } from '../../../../lib/require-role';
import { autoReconcileCompany } from '../../../../lib/bank-reconcile';

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const accountId = body.accountId ? String(body.accountId) : null;

  try {
    const r = await autoReconcileCompany(cid, locals.user.id, accountId);
    return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Auto-reconcilierea a eșuat.' }), { status: 500 });
  }
};
