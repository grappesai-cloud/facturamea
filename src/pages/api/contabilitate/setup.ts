import type { APIRoute } from 'astro';
import { ensureChart } from '../../../lib/accounting';

// POST — initialize the Romanian chart of accounts for the current company.
import { requireRole } from '../../../lib/require-role';
export const POST: APIRoute = async ({ locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  try {
    const res = await ensureChart(cid);
    return new Response(JSON.stringify({ ok: true, created: res.created }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Eroare la inițializare' }), { status: 500 });
  }
};
