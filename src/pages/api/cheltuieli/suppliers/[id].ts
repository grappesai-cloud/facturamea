// Supplier by id — PATCH (update fields), DELETE.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { suppliers } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';

const FIELDS = ['name', 'cui', 'regCom', 'address', 'city', 'country', 'iban', 'email', 'phone'] as const;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let existing: any = null;
  try {
    [existing] = await db.select().from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.companyId, cid))).limit(1);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare conexiune' }), { status: 500 });
  }
  if (!existing) return new Response(JSON.stringify({ error: 'Furnizor inexistent' }), { status: 404 });

  const patch: any = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    patch[f] = typeof body[f] === 'string' ? (body[f].trim() || null) : body[f];
  }
  if (body.isActive !== undefined) patch.isActive = !!body.isActive;
  if (patch.name === null) return new Response(JSON.stringify({ error: 'Numele e obligatoriu' }), { status: 400 });

  try {
    await db.update(suppliers).set(patch).where(and(eq(suppliers.id, id), eq(suppliers.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  // Soft-delete: deactivate so historical expenses keep their supplier link.
  try {
    await db.update(suppliers).set({ isActive: false })
      .where(and(eq(suppliers.id, id), eq(suppliers.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
