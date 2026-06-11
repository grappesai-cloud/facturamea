// GET /api/anaf/lookup?cui=12345678
//
// Thin alias for the existing /api/tools/lookup-cui — kept for
// callers that prefer the /anaf/* namespace. Public, anonymous,
// rate-limited per IP. Uses the public ANAF v9 webservice (no OAuth).
import type { APIRoute } from 'astro';
import { lookupAnaf } from '../../../lib/anaf-lookup';
import { rateLimitAsync, getClientIp } from '../../../lib/security';

export const GET: APIRoute = async ({ url, request }) => {
  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`anaf-lookup:${ip}`, 20, 60_000);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Prea multe căutări. Aşteaptă un minut.' }), { status: 429 });

  const cui = url.searchParams.get('cui')?.trim().replace(/^RO/i, '').replace(/\D/g, '');
  if (!cui || cui.length < 2 || cui.length > 10) return new Response(JSON.stringify({ error: 'CUI invalid' }), { status: 400 });

  const result = await lookupAnaf(cui);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
