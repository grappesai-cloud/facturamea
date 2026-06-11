// Current stock levels — joined to products + warehouses for display.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockLevels, invoiceProducts, warehouses } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const warehouseId = url.searchParams.get('warehouseId')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(stockLevels.companyId, cid)];
    if (warehouseId) conds.push(eq(stockLevels.warehouseId, warehouseId));
    results = await db
      .select({
        id: stockLevels.id,
        warehouseId: stockLevels.warehouseId,
        warehouseName: warehouses.name,
        productId: stockLevels.productId,
        productName: invoiceProducts.name,
        productCode: invoiceProducts.code,
        um: invoiceProducts.defaultUm,
        quantity: stockLevels.quantity,
        avgCostCents: stockLevels.avgCostCents,
        minQuantity: stockLevels.minQuantity,
        updatedAt: stockLevels.updatedAt,
      })
      .from(stockLevels)
      .leftJoin(invoiceProducts, eq(stockLevels.productId, invoiceProducts.id))
      .leftJoin(warehouses, eq(stockLevels.warehouseId, warehouses.id))
      .where(and(...conds))
      .orderBy(desc(stockLevels.updatedAt))
      .limit(500);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};
