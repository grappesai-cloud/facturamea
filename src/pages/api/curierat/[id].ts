import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { shipments } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';

import { requireRole } from '../../../lib/require-role';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);
  const id = params.id;
  if (!id) return json({ error: 'ID lipsă' }, 400);

  try {
    await db.delete(shipments).where(and(eq(shipments.id, id), eq(shipments.companyId, cid)));
    return json({ success: true });
  } catch {
    return json({ error: 'Eroare la ștergere' }, 500);
  }
};
