// Stock helpers — keep stockLevels + stockMovements in sync.
//
// On IN we recompute a weighted-average unit cost so that
// avgCostCents reflects the blended cost of all units on hand.
// On OUT we decrement quantity (cost stays the running average).
//
// Both helpers insert a stockMovements ledger row. Pass `executor` (a tx) so a
// caller can enroll the level update + movement insert in ONE transaction — a
// failure between them otherwise desyncs the stock level from its ledger.

import { db } from '../db';
import { stockLevels, stockMovements } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = typeof db | Tx;

export interface StockRef {
  reason?: string | null;
  refType?: string | null; // 'nir' | 'invoice' | 'pos' | 'manual' | 'transfer'
  refId?: string | null;
  userId?: string | null;
}

async function getLevel(exec: DbLike, companyId: string, warehouseId: string, productId: string) {
  const [row] = await exec
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
  ref: StockRef = {},
  executor: DbLike = db,
): Promise<void> {
  const quantity = Number(qty) || 0;
  if (quantity <= 0) return;
  const cost = Math.max(0, Math.round(Number(unitCostCents) || 0));

  // Atomic upsert on the (warehouse, product) unique key. The weighted-average is
  // recomputed inside the UPDATE from the row's own values, so concurrent stock
  // ops can't lose quantity or corrupt avg cost (the previous SELECT-then-write
  // had a lost-update + first-write race).
  await executor.insert(stockLevels).values({
    id: nanoid(), companyId, warehouseId, productId, quantity, avgCostCents: cost, minQuantity: 0,
  } as any).onConflictDoUpdate({
    target: [stockLevels.warehouseId, stockLevels.productId],
    set: {
      quantity: sql`${stockLevels.quantity} + ${quantity}`,
      // All operands cast to numeric: stockLevels.quantity is double precision,
      // so a bare `::numeric / (quantity + n)` mixes numeric with float8 and the
      // statement fails to plan (no numeric/double-precision division) — which
      // broke EVERY stock-in (NIR, transfer-in, storno reversal, count surplus).
      avgCostCents: sql`CASE WHEN (${stockLevels.quantity} + ${quantity}) > 0 THEN ROUND((${stockLevels.quantity}::numeric * ${stockLevels.avgCostCents}::numeric + ${quantity}::numeric * ${cost}::numeric) / (${stockLevels.quantity} + ${quantity})::numeric) ELSE ${cost} END`,
      updatedAt: new Date(),
    },
  });

  await executor.insert(stockMovements).values({
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
  unitCostCents: number | null,
  ref: StockRef = {},
  executor: DbLike = db,
): Promise<void> {
  const quantity = Number(qty) || 0;
  if (quantity <= 0) return;

  // Cost for the movement ledger only (informational — the decrement is atomic
  // below regardless). Use the caller-provided cost, else the current avg cost.
  const existing = unitCostCents != null ? null : await getLevel(executor, companyId, warehouseId, productId);
  const cost = unitCostCents != null
    ? Math.max(0, Math.round(Number(unitCostCents) || 0))
    : (existing ? Number(existing.avgCostCents) || 0 : 0);

  // Atomic decrement on the unique key (creates a negative level if none exists,
  // so the ledger always reconciles). No SELECT-then-write race.
  await executor.insert(stockLevels).values({
    id: nanoid(), companyId, warehouseId, productId, quantity: -quantity, avgCostCents: cost, minQuantity: 0,
  } as any).onConflictDoUpdate({
    target: [stockLevels.warehouseId, stockLevels.productId],
    set: { quantity: sql`${stockLevels.quantity} - ${quantity}`, updatedAt: new Date() },
  });

  await executor.insert(stockMovements).values({
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
