// Fixed-asset depreciation helpers (mijloace fixe + amortizare).
//
// Romanian regimes (Codul fiscal art. 28):
//   - liniară:    cota uniformă pe toată durata = valoare / durata (luni)
//   - degresivă:  cotă liniară majorată cu un coeficient, aplicată valorii rămase
//                 (best-effort: comutăm pe liniar pe restul duratei când e mai
//                 avantajos, ca în practică)
//   - accelerată: 50% în primul an, restul liniar pe durata rămasă (best-effort)
//
// All money is INTEGER cents. Functions that touch the DB are wrapped in
// try/catch so they degrade gracefully when the database isn't provisioned.

import { db } from '../db';
import { fixedAssets, depreciationEntries } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface AssetLike {
  valueCents: number;
  usefulLifeMonths: number;
  method?: string | null;
  accumulatedCents?: number | null;
  acquisitionDate?: string | null;
}

// Degressive coefficient by useful life (years), per Codul fiscal:
//   durata <= 5 ani -> 1.5 ; 5 < durata <= 10 -> 2.0 ; durata > 10 -> 2.5
function degressiveCoefficient(usefulLifeMonths: number): number {
  const years = usefulLifeMonths / 12;
  if (years <= 5) return 1.5;
  if (years <= 10) return 2.0;
  return 2.5;
}

/**
 * Monthly depreciation for an asset, given how much is already accumulated.
 * Returns the amount in cents to book for the *next* period, never exceeding
 * the remaining un-depreciated value. Returns 0 once fully depreciated.
 */
export function monthlyDepreciation(asset: AssetLike): number {
  const value = Math.max(0, Math.round(asset.valueCents || 0));
  const months = Math.max(1, Math.round(asset.usefulLifeMonths || 1));
  const accumulated = Math.max(0, Math.round(asset.accumulatedCents || 0));
  const remaining = Math.max(0, value - accumulated);
  if (remaining <= 0) return 0;

  const method = asset.method || 'liniara';

  // Straight-line baseline.
  const linear = Math.round(value / months);

  let amount: number;
  if (method === 'degresiva') {
    // Degressive: linear rate * coefficient, applied to the remaining net value.
    // We compare against straight-lining the remaining value over the remaining
    // months and take the larger (standard Romanian practice keeps you on the
    // accelerated curve until linear-on-remainder catches up).
    const monthsElapsed = Math.round(accumulated / Math.max(1, linear));
    const monthsLeft = Math.max(1, months - monthsElapsed);
    const monthlyRate = (1 / months) * degressiveCoefficient(months);
    const degressive = Math.round(remaining * monthlyRate);
    const linearOnRemainder = Math.round(remaining / monthsLeft);
    amount = Math.max(degressive, linearOnRemainder);
  } else if (method === 'accelerata') {
    // Accelerated: 50% of value booked across the first 12 months, the rest
    // straight-lined over the remaining life. Best-effort per-month figure.
    const firstYearTotal = Math.round(value * 0.5);
    if (accumulated < firstYearTotal) {
      amount = Math.round(firstYearTotal / 12);
    } else {
      const monthsLeft = Math.max(1, months - 12);
      amount = Math.round((value - firstYearTotal) / monthsLeft);
    }
  } else {
    // liniara (default)
    amount = linear;
  }

  // Never depreciate more than what's left; absorb rounding on the last month.
  if (amount <= 0) amount = remaining; // guard against 0-rate edge cases
  return Math.min(amount, remaining);
}

/** Full per-period schedule for an asset (for the detail page). */
export interface ScheduleRow {
  index: number;     // 1-based period number
  amountCents: number;
  accumulatedCents: number;
  remainingCents: number;
}

export function buildSchedule(asset: AssetLike, maxRows = 600): ScheduleRow[] {
  const value = Math.max(0, Math.round(asset.valueCents || 0));
  const rows: ScheduleRow[] = [];
  let accumulated = 0;
  let i = 0;
  while (accumulated < value && i < maxRows) {
    const amount = monthlyDepreciation({ ...asset, accumulatedCents: accumulated });
    if (amount <= 0) break;
    accumulated += amount;
    i += 1;
    rows.push({
      index: i,
      amountCents: amount,
      accumulatedCents: accumulated,
      remainingCents: Math.max(0, value - accumulated),
    });
  }
  return rows;
}

export interface RunDepreciationResult {
  period: string;
  processed: number;     // assets that got a new entry
  skipped: number;       // assets already done / fully depreciated
  totalCents: number;    // total depreciation booked this run
  ok: boolean;
  error?: string;
}

/**
 * Book depreciation for `period` (YYYY-MM) across all active assets of a
 * company that haven't been depreciated for that period yet and aren't fully
 * depreciated. Inserts a depreciationEntries row and increments
 * accumulatedCents (capped at value). Idempotent thanks to the unique
 * (assetId, period) index — re-running the same period is a no-op.
 */
export async function runDepreciation(companyId: string, period: string): Promise<RunDepreciationResult> {
  const result: RunDepreciationResult = { period, processed: 0, skipped: 0, totalCents: 0, ok: true };
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { ...result, ok: false, error: 'Perioadă invalidă (folosește YYYY-MM)' };
  }

  try {
    const assets = await db.select().from(fixedAssets).where(and(
      eq(fixedAssets.companyId, companyId),
      eq(fixedAssets.status, 'active'),
    ));

    for (const asset of assets) {
      const value = Math.max(0, Math.round(asset.valueCents || 0));
      const accumulated = Math.max(0, Math.round(asset.accumulatedCents || 0));
      if (accumulated >= value) { result.skipped += 1; continue; }

      // Already booked for this period?
      try {
        const [existing] = await db.select().from(depreciationEntries).where(and(
          eq(depreciationEntries.assetId, asset.id),
          eq(depreciationEntries.period, period),
        )).limit(1);
        if (existing) { result.skipped += 1; continue; }
      } catch { /* if select fails, attempt insert and let unique index guard */ }

      const amount = monthlyDepreciation(asset);
      if (amount <= 0) { result.skipped += 1; continue; }

      const newAccumulated = Math.min(value, accumulated + amount);
      try {
        await db.insert(depreciationEntries).values({
          id: nanoid(),
          assetId: asset.id,
          companyId,
          period,
          amountCents: amount,
          postedJournalId: null,
        } as any);
      } catch {
        // Likely the unique (assetId, period) constraint — treat as skipped.
        result.skipped += 1;
        continue;
      }

      try {
        await db.update(fixedAssets)
          .set({ accumulatedCents: newAccumulated })
          .where(eq(fixedAssets.id, asset.id));
      } catch { /* entry is booked even if the rollup update failed */ }

      result.processed += 1;
      result.totalCents += amount;
    }
  } catch (err) {
    return { ...result, ok: false, error: err instanceof Error ? err.message : 'Eroare la rularea amortizării' };
  }

  return result;
}
