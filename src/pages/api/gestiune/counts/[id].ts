// Single stock count: GET (header + lines joined to products) and POST to
// finalize. Finalizing applies the counted quantities: for each line whose
// countedQty differs from systemQty we post the difference to stock via
// applyStockIn (surplus) or applyStockOut (shortage), then mark 'finalized'.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockCounts, stockCountLines, invoiceProducts, stockLevels } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { applyStockIn, applyStockOut } from '../../../../lib/stock';
import { requireRole } from '../../../../lib/require-role';

async function loadCount(cid: string, id: string) {
  const [count] = await db.select().from(stockCounts)
    .where(and(eq(stockCounts.id, id), eq(stockCounts.companyId, cid))).limit(1);
  if (!count) return null;
  const lines = await db
    .select({
      id: stockCountLines.id,
      productId: stockCountLines.productId,
      productName: invoiceProducts.name,
      productCode: invoiceProducts.code,
      um: invoiceProducts.defaultUm,
      systemQty: stockCountLines.systemQty,
      countedQty: stockCountLines.countedQty,
      diffQty: stockCountLines.diffQty,
    })
    .from(stockCountLines)
    .leftJoin(invoiceProducts, eq(stockCountLines.productId, invoiceProducts.id))
    .where(eq(stockCountLines.countId, id));
  return { count, lines };
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    const data = await loadCount(cid, id);
    if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
};

// POST = finalize. Accepts an optional `lines` array [{ id|productId, countedQty }]
// to persist the user's entered counted quantities before posting adjustments.
export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let data;
  try {
    data = await loadCount(cid, id);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
  if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
  const { count } = data;
  if (count.status === 'finalized') return new Response(JSON.stringify({ error: 'Inventarul e deja finalizat' }), { status: 400 });

  // Map of user-entered counted quantities keyed by line id and by productId.
  const entered = new Map<string, number>();
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      const v = Number(l.countedQty);
      if (Number.isNaN(v)) continue;
      if (l.id) entered.set(`id:${l.id}`, v);
      if (l.productId) entered.set(`pid:${l.productId}`, v);
    }
  }

  try {
    let adjusted = 0;
    for (const line of data.lines) {
      const systemQty = Number(line.systemQty) || 0;
      let counted = Number(line.countedQty) || 0;
      const fromIdKey = entered.get(`id:${line.id}`);
      const fromPidKey = line.productId ? entered.get(`pid:${line.productId}`) : undefined;
      if (fromIdKey !== undefined) counted = fromIdKey;
      else if (fromPidKey !== undefined) counted = fromPidKey;

      const diff = counted - systemQty;

      // Persist counted + diff on the line.
      await db.update(stockCountLines)
        .set({ countedQty: counted, diffQty: diff })
        .where(eq(stockCountLines.id, line.id));

      if (diff === 0 || !line.productId) continue;

      // Pull avg cost for the surplus case (so the value stays meaningful).
      let avgCost = 0;
      try {
        const [lvl] = await db.select({ avg: stockLevels.avgCostCents }).from(stockLevels)
          .where(and(eq(stockLevels.companyId, cid), eq(stockLevels.warehouseId, count.warehouseId), eq(stockLevels.productId, line.productId))).limit(1);
        avgCost = Number(lvl?.avg) || 0;
      } catch { /* keep 0 */ }

      if (diff > 0) {
        await applyStockIn(cid, count.warehouseId, line.productId, diff, avgCost, {
          reason: `Inventar ${count.number || ''} (plus)`,
          refType: 'manual',
          refId: count.id,
          userId: locals.user.id,
        });
      } else {
        await applyStockOut(cid, count.warehouseId, line.productId, Math.abs(diff), avgCost, {
          reason: `Inventar ${count.number || ''} (minus)`,
          refType: 'manual',
          refId: count.id,
          userId: locals.user.id,
        });
      }
      adjusted++;
    }

    await db.update(stockCounts).set({ status: 'finalized' })
      .where(and(eq(stockCounts.id, id), eq(stockCounts.companyId, cid)));

    return new Response(JSON.stringify({ ok: true, adjusted }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la finalizarea inventarului' }), { status: 500 });
  }
};
