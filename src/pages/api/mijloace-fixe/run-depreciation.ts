// POST /api/mijloace-fixe/run-depreciation  body { period: 'YYYY-MM' }
// Books depreciation for the given period across the company's active assets.

import type { APIRoute } from 'astro';
import { runDepreciation } from '../../../lib/depreciation';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  let period = String(body.period || '').trim();
  if (!period) {
    const now = new Date();
    period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return new Response(JSON.stringify({ error: 'Perioadă invalidă (folosește YYYY-MM)' }), { status: 400 });
  }

  const result = await runDepreciation(cid, period);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error || 'Eroare la rularea amortizării' }), { status: 500 });
  }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
