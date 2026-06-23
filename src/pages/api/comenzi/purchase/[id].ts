// Single purchase order: GET (with lines), PATCH (status change + action='receive'),
// DELETE. The 'receive' action posts a stock IN for every line that references a
// product into a chosen warehouse (weighted-average cost), then marks the order
// as 'received'.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { purchaseOrders, purchaseOrderLines, warehouses } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { applyStockIn } from '../../../../lib/stock';
import { requireRole } from '../../../../lib/require-role';

const VALID_STATUS = ['draft', 'sent', 'received', 'closed', 'canceled'];

async function loadOrder(cid: string, id: string) {
  const [order] = await db.select().from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid))).limit(1);
  if (!order) return null;
  const lines = await db.select().from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, id));
  return { order, lines };
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    const data = await loadOrder(cid, id);
    if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'stock.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let data;
  try {
    data = await loadOrder(cid, id);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
  }
  if (!data) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
  const { order, lines } = data;

  // ── action='receive' → post stock IN into a chosen warehouse ──
  if (body.action === 'receive') {
    if (order.status === 'received') {
      return new Response(JSON.stringify({ error: 'Comanda e deja recepționată' }), { status: 400 });
    }
    if (order.status === 'canceled') {
      return new Response(JSON.stringify({ error: 'Comanda e anulată' }), { status: 400 });
    }
    const warehouseId = String(body.warehouseId || '').trim();
    if (!warehouseId) return new Response(JSON.stringify({ error: 'Alege o gestiune pentru recepție' }), { status: 400 });

    try {
      const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
        .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, cid))).limit(1);
      if (!wh) return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 400 });

      // Atomic: all stock-ins + the status flip in one tx, so a retry after a
      // partial failure can't double-apply stock (status stays not-received).
      await db.transaction(async (tx) => {
        for (const l of lines) {
          if (!l.productId) continue; // stock references products only
          const qty = Number(l.quantity) || 0;
          if (qty <= 0) continue;
          await applyStockIn(cid, warehouseId, l.productId, qty, Math.round(Number(l.unitPriceCents) || 0), {
            reason: `Comandă furnizor ${order.number}`,
            refType: 'nir',
            refId: order.id,
            userId: locals.user!.id,
          }, tx);
        }
        await tx.update(purchaseOrders).set({ status: 'received' })
          .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid)));
      });

      return new Response(JSON.stringify({ ok: true, status: 'received' }), { headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ error: 'Nu s-a putut recepționa comanda' }), { status: 500 });
    }
  }

  // ── plain status change ──
  const next = String(body.status || '').trim();
  if (!VALID_STATUS.includes(next)) return new Response(JSON.stringify({ error: 'Status invalid' }), { status: 400 });
  try {
    await db.update(purchaseOrders).set({ status: next })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, status: next }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'stock.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  try {
    const [order] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid))).limit(1);
    if (!order) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });
    if (order.status === 'received') return new Response(JSON.stringify({ error: 'Comanda recepționată nu poate fi ștearsă' }), { status: 400 });
    await db.delete(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
