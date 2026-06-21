import type { APIRoute } from 'astro';
import { autoPostAll } from '../../../lib/accounting';
import { requireRole } from '../../../lib/require-role';

// POST — generate journal entries from all not-yet-posted invoices, expenses
// and payments for the current company. Idempotent (skips already-posted docs).
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  try {
    const result = await autoPostAll(cid, locals.user.id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Eroare la generare' }), { status: 500 });
  }
};
