import type { APIRoute } from 'astro';
import { trialBalance } from '../../../lib/accounting';

// GET ?from=&to= — balanță de verificare (trial balance) for the period.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ rows: [] }), { headers: { 'Content-Type': 'application/json' } });

  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';

  try {
    const rows = await trialBalance(cid, from, to);
    return new Response(JSON.stringify({ rows, from, to }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ rows: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};
