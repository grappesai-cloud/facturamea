// Stock transfer between two warehouses (gestiuni).
//
// Best-effort atomic: applyStockOut(from) then applyStockIn(to). Both helpers
// write a stockMovements ledger row; we tag the OUT row's reason so the pair is
// recognizable as a transfer. We carry the source warehouse's avg cost to the
// destination so the value follows the goods.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { warehouses, stockLevels, invoiceProducts } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { applyStockIn, applyStockOut } from '../../../../lib/stock';
import { requireRole } from '../../../../lib/require-role';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const fromWarehouseId = String(body.fromWarehouseId || '').trim();
  const toWarehouseId = String(body.toWarehouseId || '').trim();
  const productId = String(body.productId || '').trim();
  const quantity = Number(body.quantity) || 0;

  if (!fromWarehouseId || !toWarehouseId) return new Response(JSON.stringify({ error: 'Alege gestiunea sursă și destinație' }), { status: 400 });
  if (fromWarehouseId === toWarehouseId) return new Response(JSON.stringify({ error: 'Gestiunile trebuie să fie diferite' }), { status: 400 });
  if (!productId) return new Response(JSON.stringify({ error: 'Alege un produs' }), { status: 400 });
  if (quantity <= 0) return new Response(JSON.stringify({ error: 'Cantitatea trebuie să fie pozitivă' }), { status: 400 });

  try {
    // Validate both warehouses + product belong to the company.
    const whs = await db.select({ id: warehouses.id }).from(warehouses)
      .where(eq(warehouses.companyId, cid));
    const whIds = new Set(whs.map((w) => w.id));
    if (!whIds.has(fromWarehouseId) || !whIds.has(toWarehouseId)) {
      return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 400 });
    }
    const [prod] = await db.select({ id: invoiceProducts.id }).from(invoiceProducts)
      .where(and(eq(invoiceProducts.id, productId), eq(invoiceProducts.companyId, cid))).limit(1);
    if (!prod) return new Response(JSON.stringify({ error: 'Produs inexistent' }), { status: 400 });

    // Read source level for available qty + cost.
    const [src] = await db.select({ quantity: stockLevels.quantity, avg: stockLevels.avgCostCents })
      .from(stockLevels)
      .where(and(eq(stockLevels.companyId, cid), eq(stockLevels.warehouseId, fromWarehouseId), eq(stockLevels.productId, productId))).limit(1);
    const available = Number(src?.quantity) || 0;
    if (available < quantity) {
      return new Response(JSON.stringify({ error: `Stoc insuficient în sursă (disponibil: ${available})` }), { status: 400 });
    }
    const unitCost = Number(src?.avg) || 0;

    const ref = `Transfer ${fromWarehouseId}→${toWarehouseId}`;
    // Atomic: OUT from source + IN to destination in one transaction, so a
    // failure can never decrement the source without crediting the destination.
    await db.transaction(async (tx) => {
      await applyStockOut(cid, fromWarehouseId, productId, quantity, unitCost, {
        reason: ref, refType: 'transfer', refId: toWarehouseId, userId: locals.user!.id,
      }, tx);
      await applyStockIn(cid, toWarehouseId, productId, quantity, unitCost, {
        reason: ref, refType: 'transfer', refId: fromWarehouseId, userId: locals.user!.id,
      }, tx);
    });

    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la transfer' }), { status: 500 });
  }
};
