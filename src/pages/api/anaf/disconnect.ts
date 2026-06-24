// POST /api/anaf/disconnect  body: { scope: 'e-factura' | 'e-transport' }
import type { APIRoute } from 'astro';
import { revokeConnection } from '../../../lib/anaf/tokens';
import { isValidScope } from '../../../lib/anaf/oauth';

import { requireRole } from '../../../lib/require-role';
export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără firmă' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Body invalid' }), { status: 400 }); }

  if (!isValidScope(body?.scope)) return new Response(JSON.stringify({ error: 'Scope invalid' }), { status: 400 });
  await revokeConnection(locals.user.companyId, body.scope);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
