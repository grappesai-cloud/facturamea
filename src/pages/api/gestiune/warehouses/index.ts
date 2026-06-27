// Warehouses (gestiuni) — list + create, scoped to the caller's company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { warehouses, stockMovements, receptions } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

const TYPES = ['depozit', 'magazin', 'custodie'];
const MGMT = ['cantitativ_valoric', 'global_valoric'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db.select().from(warehouses)
      .where(eq(warehouses.companyId, cid))
      .orderBy(desc(warehouses.createdAt))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const name = String(body.name || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Numele gestiunii e obligatoriu' }), { status: 400 });

  const type = TYPES.includes(body.type) ? body.type : 'depozit';
  const managementType = MGMT.includes(body.managementType) ? body.managementType : 'cantitativ_valoric';

  const id = nanoid();
  try {
    await db.insert(warehouses).values({
      id,
      companyId: cid,
      name,
      code: body.code?.trim() || null,
      type,
      address: body.address?.trim() || null,
      managementType,
      isDefault: !!body.isDefault,
      isActive: body.isActive !== false,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

// DELETE /api/gestiune/warehouses?id=... — only an EMPTY warehouse (no stock
// movements, no receptions) can be removed. A used one keeps its history.
export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.id, id), eq(warehouses.companyId, cid))).limit(1);
  if (!wh) return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 404 });

  const [mov] = await db.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.warehouseId, id)).limit(1);
  const [rec] = await db.select({ id: receptions.id }).from(receptions).where(eq(receptions.warehouseId, id)).limit(1);
  if (mov || rec) {
    return new Response(JSON.stringify({ error: 'Gestiunea are mișcări de stoc sau recepții și nu poate fi ștearsă. Golește-o întâi.' }), { status: 422 });
  }

  await db.delete(warehouses).where(and(eq(warehouses.id, id), eq(warehouses.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
