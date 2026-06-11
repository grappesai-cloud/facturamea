// GET /api/anaf/etransport/list?cif=...&days=60
import type { APIRoute } from 'astro';
import { listRecent } from '../../../../lib/anaf/etransport';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const cif = url.searchParams.get('cif')?.replace(/^RO/i, '').replace(/\D/g, '');
  if (!cif) return new Response(JSON.stringify({ error: 'CIF lipsă' }), { status: 400 });
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '60', 10) || 60, 1), 60);
  const r = await listRecent(locals.user.companyId, cif, days);
  return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
};
