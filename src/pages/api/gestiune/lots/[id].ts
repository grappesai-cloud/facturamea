// Single stock lot — DELETE only (remove a lot record).
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockLots } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    await db.delete(stockLots).where(and(eq(stockLots.id, id), eq(stockLots.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
