// GET /api/anaf/efactura/status?spvIndex=...
import type { APIRoute } from 'astro';
import { getSubmissionStatus } from '../../../../lib/anaf/efactura-client';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const idx = url.searchParams.get('spvIndex');
  if (!idx) return new Response(JSON.stringify({ error: 'spvIndex lipsă' }), { status: 400 });
  const r = await getSubmissionStatus(locals.user.companyId, idx);
  return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
};
