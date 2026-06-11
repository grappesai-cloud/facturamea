// GET /api/anaf/status — list connected scopes for the current user's company.
import type { APIRoute } from 'astro';
import { listConnections } from '../../../lib/anaf/tokens';
import { isConfigured } from '../../../lib/anaf/config';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ configured: isConfigured(), connections: [] }), { headers: { 'Content-Type': 'application/json' } });

  const rows = await listConnections(locals.user.companyId);
  return new Response(JSON.stringify({
    configured: isConfigured(),
    connections: rows.map(r => ({
      scope: r.scope,
      cif: r.cif,
      connectedAt: r.connectedAt,
      accessExpiresAt: r.accessExpiresAt,
      refreshExpiresAt: r.refreshExpiresAt,
      lastUsedAt: r.lastUsedAt,
    })),
  }), { headers: { 'Content-Type': 'application/json' } });
};
