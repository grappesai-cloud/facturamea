// Diferențe de curs valutar — month-end FX revaluation of open foreign-currency
// receivables (unpaid invoices, 4111) and payables (unpaid expenses, 401) against
// the BNR rate at the revaluation date. Favorable differences book to 765
// (venituri), unfavorable to 665 (cheltuieli). Bank FX balances are out of scope
// (no per-revaluation book value is tracked). RON items are ignored.
import { db } from '../db';
import { transportInvoices, expenses } from '../db/schema';
import { and, eq, ne, lte } from 'drizzle-orm';
import { getBnrRate } from './bnr-fx';

export interface FxItem {
  kind: 'creanță' | 'datorie';
  doc: string;
  partner: string;
  currency: string;
  remainingForeignCents: number;
  originalRate: number;
  currentRate: number;
  originalRonCents: number;
  currentRonCents: number;
  diffCents: number;          // currentRon − originalRon
  favorableCents: number;     // → 765
  unfavorableCents: number;   // → 665
}
export interface FxRevaluation {
  date: string;
  rates: Record<string, { rate: number; source: string } | null>;
  items: FxItem[];
  totalFavorableCents: number;
  totalUnfavorableCents: number;
  netCents: number;
}

export async function collectFxRevaluation(companyId: string, date: string): Promise<FxRevaluation> {
  const items: FxItem[] = [];
  const rates: Record<string, { rate: number; source: string } | null> = {};
  const toEnd = new Date(date + 'T23:59:59Z');

  const rateFor = async (cur: string): Promise<number | null> => {
    if (cur in rates) return rates[cur]?.rate ?? null;
    const r = await getBnrRate(date, cur).catch(() => null);
    rates[cur] = r ? { rate: r.rate, source: r.source } : null;
    return r?.rate ?? null;
  };

  // ── Creanțe: open foreign-currency invoices (receivables grow → 765 gain) ──
  try {
    const invs = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, companyId),
      ne(transportInvoices.status, 'voided'),
      ne(transportInvoices.status, 'draft'),
      lte(transportInvoices.issuedAt, toEnd),
    ));
    for (const inv of invs) {
      if (inv.kind !== 'factura') continue;
      const cur = (inv.currency || 'RON').toUpperCase();
      if (cur === 'RON' || !inv.bnrRate) continue;
      const remaining = (inv.totalCents || 0) - (inv.paidCents || 0);
      if (remaining <= 0) continue;
      const cr = await rateFor(cur);
      if (cr == null) continue;
      const originalRon = Math.round(remaining * inv.bnrRate);
      const currentRon = Math.round(remaining * cr);
      const diff = currentRon - originalRon;
      items.push({
        kind: 'creanță', doc: inv.fullNumber || inv.id.slice(0, 8), partner: inv.clientNameSnap || '',
        currency: cur, remainingForeignCents: remaining, originalRate: inv.bnrRate, currentRate: cr,
        originalRonCents: originalRon, currentRonCents: currentRon, diffCents: diff,
        favorableCents: diff > 0 ? diff : 0, unfavorableCents: diff < 0 ? -diff : 0,
      });
    }
  } catch { /* skip */ }

  // ── Datorii: open foreign-currency expenses (payables grow → 665 loss) ──
  try {
    const rows = await db.select().from(expenses).where(and(
      eq(expenses.companyId, companyId),
      lte(expenses.issueDate, date),
    ));
    for (const exp of rows) {
      const cur = (exp.currency || 'RON').toUpperCase();
      if (cur === 'RON' || !exp.bnrRate) continue;
      const remaining = (exp.totalCents || 0) - (exp.paidCents || 0);
      if (remaining <= 0) continue;
      const cr = await rateFor(cur);
      if (cr == null) continue;
      const originalRon = Math.round(remaining * Number(exp.bnrRate));
      const currentRon = Math.round(remaining * cr);
      const diff = currentRon - originalRon;
      // Liability: a higher RON value is a LOSS (665); lower is a GAIN (765).
      items.push({
        kind: 'datorie', doc: exp.documentNumber || exp.id.slice(0, 8), partner: exp.supplierNameSnap || 'Furnizor',
        currency: cur, remainingForeignCents: remaining, originalRate: Number(exp.bnrRate), currentRate: cr,
        originalRonCents: originalRon, currentRonCents: currentRon, diffCents: diff,
        favorableCents: diff < 0 ? -diff : 0, unfavorableCents: diff > 0 ? diff : 0,
      });
    }
  } catch { /* skip */ }

  let totalFav = 0; let totalUnf = 0;
  for (const it of items) { totalFav += it.favorableCents; totalUnf += it.unfavorableCents; }
  return { date, rates, items, totalFavorableCents: totalFav, totalUnfavorableCents: totalUnf, netCents: totalFav - totalUnf };
}
