import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { integrationConnections } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// PATCH: toggle isActive / autoInvoice (only fields the user is allowed to flip).
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);
  const id = params.id;
  if (!id) return json({ error: 'ID lipsă' }, 400);

  try {
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = {};
    if (typeof body?.isActive === 'boolean') patch.isActive = body.isActive;
    if (typeof body?.autoInvoice === 'boolean') patch.autoInvoice = body.autoInvoice;
    if (typeof body?.label === 'string') patch.label = body.label.trim().slice(0, 120) || null;
    if (Object.keys(patch).length === 0) return json({ error: 'Nimic de actualizat' }, 400);

    await db
      .update(integrationConnections)
      .set(patch)
      .where(and(eq(integrationConnections.id, id), eq(integrationConnections.companyId, cid)));

    return json({ success: true });
  } catch {
    return json({ error: 'Eroare la actualizare' }, 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);
  const id = params.id;
  if (!id) return json({ error: 'ID lipsă' }, 400);

  try {
    await db
      .delete(integrationConnections)
      .where(and(eq(integrationConnections.id, id), eq(integrationConnections.companyId, cid)));
    return json({ success: true });
  } catch {
    return json({ error: 'Eroare la ștergere' }, 500);
  }
};
