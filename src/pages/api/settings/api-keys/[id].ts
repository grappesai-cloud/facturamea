import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { apiKeys } from '../../../../db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';

// DELETE /api/settings/api-keys/:id — revoke (soft) by setting revokedAt.
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const companyId = locals.user.companyId;
  if (!companyId) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const id = params.id;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const [existing] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId)))
      .limit(1);
    if (!existing) return new Response(JSON.stringify({ error: 'Cheie inexistentă' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.companyId, companyId), isNull(apiKeys.revokedAt)));
    return new Response(JSON.stringify({ ok: true, id }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la revocare' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
