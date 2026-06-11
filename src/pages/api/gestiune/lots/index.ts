// Stock lots (loturi / expirare) — list + create.
//
// A lot ties a quantity of a product (in a warehouse) to a lot code and an
// optional expiry date. Used for traceability + FEFO and expiry alerts.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockLots, invoiceProducts, warehouses } from '../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const productId = url.searchParams.get('productId')?.trim();
  const warehouseId = url.searchParams.get('warehouseId')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(stockLots.companyId, cid)];
    if (productId) conds.push(eq(stockLots.productId, productId));
    if (warehouseId) conds.push(eq(stockLots.warehouseId, warehouseId));
    results = await db
      .select({
        id: stockLots.id,
        warehouseId: stockLots.warehouseId,
        warehouseName: warehouses.name,
        productId: stockLots.productId,
        productName: invoiceProducts.name,
        productCode: invoiceProducts.code,
        um: invoiceProducts.defaultUm,
        lotCode: stockLots.lotCode,
        expiryDate: stockLots.expiryDate,
        quantity: stockLots.quantity,
        unitCostCents: stockLots.unitCostCents,
        createdAt: stockLots.createdAt,
      })
      .from(stockLots)
      .leftJoin(invoiceProducts, eq(stockLots.productId, invoiceProducts.id))
      .leftJoin(warehouses, eq(stockLots.warehouseId, warehouses.id))
      .where(and(...conds))
      // Expiring-soonest first; nulls sort last in Postgres asc by default.
      .orderBy(asc(stockLots.expiryDate))
      .limit(500);
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
  const productId = String(body.productId || '').trim();
  const lotCode = String(body.lotCode || '').trim();
  if (!productId) return new Response(JSON.stringify({ error: 'Alege un produs' }), { status: 400 });
  if (!lotCode) return new Response(JSON.stringify({ error: 'Codul lotului e obligatoriu' }), { status: 400 });

  const quantity = Math.max(0, Number(body.quantity) || 0);
  const unitCostCents = Math.max(0, Math.round(Number(body.unitCostCents) || 0));

  const id = nanoid();
  try {
    const [prod] = await db.select({ id: invoiceProducts.id }).from(invoiceProducts)
      .where(and(eq(invoiceProducts.id, productId), eq(invoiceProducts.companyId, cid))).limit(1);
    if (!prod) return new Response(JSON.stringify({ error: 'Produs inexistent' }), { status: 400 });

    let warehouseId: string | null = body.warehouseId ? String(body.warehouseId).trim() : null;
    if (warehouseId) {
      const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
        .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, cid))).limit(1);
      if (!wh) warehouseId = null;
    }

    await db.insert(stockLots).values({
      id,
      companyId: cid,
      warehouseId,
      productId,
      lotCode,
      expiryDate: body.expiryDate || null,
      quantity,
      unitCostCents,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvarea lotului' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
