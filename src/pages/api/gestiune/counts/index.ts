// Stock counts (inventariere) — list + create.
//
// A count is a snapshot of system quantities for a warehouse that the user
// reconciles against a physical count. On create we store the header + a line
// per product with its current systemQty (countedQty defaults to systemQty,
// diff 0). Finalizing happens on [id].ts which posts the diffs to stock.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockCounts, stockCountLines, stockLevels, warehouses } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const warehouseId = url.searchParams.get('warehouseId')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(stockCounts.companyId, cid)];
    if (warehouseId) conds.push(eq(stockCounts.warehouseId, warehouseId));
    results = await db
      .select({
        id: stockCounts.id,
        warehouseId: stockCounts.warehouseId,
        warehouseName: warehouses.name,
        number: stockCounts.number,
        countDate: stockCounts.countDate,
        status: stockCounts.status,
        notes: stockCounts.notes,
        createdAt: stockCounts.createdAt,
      })
      .from(stockCounts)
      .leftJoin(warehouses, eq(stockCounts.warehouseId, warehouses.id))
      .where(and(...conds))
      .orderBy(desc(stockCounts.createdAt))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const warehouseId = String(body.warehouseId || '').trim();
  if (!warehouseId) return new Response(JSON.stringify({ error: 'Alege o gestiune' }), { status: 400 });

  const number = String(body.number || '').trim() || `INV-${Date.now().toString().slice(-8)}`;
  const countId = nanoid();

  try {
    const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, cid))).limit(1);
    if (!wh) return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 400 });

    // Snapshot current stock levels for this warehouse.
    const levels = await db
      .select({ productId: stockLevels.productId, quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(and(eq(stockLevels.companyId, cid), eq(stockLevels.warehouseId, warehouseId)));

    await db.insert(stockCounts).values({
      id: countId,
      companyId: cid,
      warehouseId,
      number,
      countDate: body.countDate || new Date().toISOString().slice(0, 10),
      status: 'draft',
      notes: body.notes?.trim() || null,
      createdByUserId: locals.user.id,
    } as any);

    if (levels.length) {
      await db.insert(stockCountLines).values(levels.map((lv) => {
        const systemQty = Number(lv.quantity) || 0;
        return {
          id: nanoid(),
          countId,
          productId: lv.productId,
          systemQty,
          countedQty: systemQty,
          diffQty: 0,
        };
      }) as any);
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la crearea inventarului' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: countId, number }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
