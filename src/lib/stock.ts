// Stock helpers — keep stockLevels + stockMovements in sync.
//
// On IN we recompute a weighted-average unit cost so that
// avgCostCents reflects the blended cost of all units on hand.
// On OUT we decrement quantity (cost stays the running average).
//
// Both helpers insert a stockMovements ledger row. Callers are
// responsible for their own try/catch when the DB may be absent.

import { db } from '../db';
import { stockLevels, stockMovements } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface StockRef {
  reason?: string | null;
  refType?: string | null; // 'nir' | 'invoice' | 'pos' | 'manual' | 'transfer'
  refId?: string | null;
  userId?: string | null;
}

async function getLevel(companyId: string, warehouseId: string, productId: string) {
  const [row] = await db
    .select()
    .from(stockLevels)
    .where(and(
      eq(stockLevels.companyId, companyId),
      eq(stockLevels.warehouseId, warehouseId),
      eq(stockLevels.productId, productId),
    ))
    .limit(1);
  return row || null;
}

/**
 * Add quantity into a (warehouse, product) stock level, recomputing the
 * weighted-average cost, and record an 'in' movement.
 */
export async function applyStockIn(
  companyId: string,
  warehouseId: string,
  productId: string,
  qty: number,
  unitCostCents: number,
  ref: StockRef = {}
): Promise<void> {
  const quantity = Number(qty) || 0;
  if (quantity <= 0) return;
  const cost = Math.max(0, Math.round(Number(unitCostCents) || 0));

  const existing = await getLevel(companyId, warehouseId, productId);
  if (existing) {
    const prevQty = Number(existing.quantity) || 0;
    const prevAvg = Number(existing.avgCostCents) || 0;
    const newQty = prevQty + quantity;
    // Weighted average; guard against division by zero.
    const newAvg = newQty > 0
      ? Math.round((prevQty * prevAvg + quantity * cost) / newQty)
      : cost;
    await db
      .update(stockLevels)
      .set({ quantity: newQty, avgCostCents: newAvg, updatedAt: new Date() })
      .where(and(eq(stockLevels.id, existing.id), eq(stockLevels.companyId, companyId)));
  } else {
    await db.insert(stockLevels).values({
      id: nanoid(),
      companyId,
      warehouseId,
      productId,
      quantity,
      avgCostCents: cost,
      minQuantity: 0,
    } as any);
  }

  await db.insert(stockMovements).values({
    id: nanoid(),
    companyId,
    warehouseId,
    productId,
    kind: 'in',
    quantity,
    unitCostCents: cost,
    reason: ref.reason || null,
    refType: ref.refType || null,
    refId: ref.refId || null,
    createdByUserId: ref.userId || null,
  } as any);
}

/**
 * Remove quantity from a (warehouse, product) stock level and record an
 * 'out' movement. Quantity may go negative (oversell) — we don't block it
 * here; callers can validate beforehand if they need strict stock.
 */
export async function applyStockOut(
  companyId: string,
  warehouseId: string,
  productId: string,
  qty: number,
  unitCostCents: number,
  ref: StockRef = {}
): Promise<void> {
  const quantity = Number(qty) || 0;
  if (quantity <= 0) return;

  const existing = await getLevel(companyId, warehouseId, productId);
  const cost = unitCostCents != null
    ? Math.max(0, Math.round(Number(unitCostCents) || 0))
    : (existing ? Number(existing.avgCostCents) || 0 : 0);

  if (existing) {
    const newQty = (Number(existing.quantity) || 0) - quantity;
    await db
      .update(stockLevels)
      .set({ quantity: newQty, updatedAt: new Date() })
      .where(and(eq(stockLevels.id, existing.id), eq(stockLevels.companyId, companyId)));
  } else {
    // No prior level — create one going negative so the ledger reconciles.
    await db.insert(stockLevels).values({
      id: nanoid(),
      companyId,
      warehouseId,
      productId,
      quantity: -quantity,
      avgCostCents: cost,
      minQuantity: 0,
    } as any);
  }

  await db.insert(stockMovements).values({
    id: nanoid(),
    companyId,
    warehouseId,
    productId,
    kind: 'out',
    quantity,
    unitCostCents: cost,
    reason: ref.reason || null,
    refType: ref.refType || null,
    refId: ref.refId || null,
    createdByUserId: ref.userId || null,
  } as any);
}
