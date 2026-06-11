// Stock movements ledger — list newest first.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockMovements, invoiceProducts, warehouses } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const productId = url.searchParams.get('productId')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(stockMovements.companyId, cid)];
    if (productId) conds.push(eq(stockMovements.productId, productId));
    results = await db
      .select({
        id: stockMovements.id,
        warehouseId: stockMovements.warehouseId,
        warehouseName: warehouses.name,
        productId: stockMovements.productId,
        productName: invoiceProducts.name,
        kind: stockMovements.kind,
        quantity: stockMovements.quantity,
        unitCostCents: stockMovements.unitCostCents,
        reason: stockMovements.reason,
        refType: stockMovements.refType,
        refId: stockMovements.refId,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(invoiceProducts, eq(stockMovements.productId, invoiceProducts.id))
      .leftJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .where(and(...conds))
      .orderBy(desc(stockMovements.createdAt))
      .limit(300);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};
