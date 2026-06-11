import type { APIRoute } from 'astro';
import { accountLedger } from '../../../lib/accounting';

// GET ?code=&from=&to= — fișa contului (account ledger with running balance).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ lines: [] }), { headers: { 'Content-Type': 'application/json' } });

  const code = url.searchParams.get('code') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!code) return new Response(JSON.stringify({ error: 'Cod cont lipsă' }), { status: 400 });

  try {
    const data = await accountLedger(cid, code, from, to);
    return new Response(JSON.stringify({ ...data, code }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ name: code, lines: [], opening: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }
};
