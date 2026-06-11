// BNR (Banca Națională a României) FX rates with persistent caching.
//
// Lookups are by (date, currency). Rates are stored in `bnr_rates_daily`
// quoted as RON per 1 unit of currency (multiplier-normalized, so HUF /
// JPY / IDR don't need divide-by-100 in callers).
//
// Sources:
//   today only:  https://www.bnr.ro/nbrfxrates.xml
//   full year:   https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml
//
// First lookup for a date triggers a fetch; we backfill the year on miss.

import { db } from '../db';
import { bnrRatesDaily } from '../db/schema-pg';
import { and, eq, lte, desc } from 'drizzle-orm';

const DAILY_URL = 'https://www.bnr.ro/nbrfxrates.xml';
const YEAR_URL = (year: number) => `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;

export interface BnrRate {
  date: string;        // YYYY-MM-DD — the BNR publishing date the rate applies to
  currency: string;    // 'EUR' / 'USD' / etc
  rate: number;        // RON per 1 unit of `currency`
  source: 'bnr-daily' | 'bnr-year-archive' | 'fallback-nearest';
}

// In-memory de-dup for the same year being fetched multiple times in one request.
const yearFetchInflight = new Map<number, Promise<number>>();

function parseRatesXml(xml: string): Array<{ date: string; currency: string; rate: number }> {
  // BNR daily XML has a single <Cube date="YYYY-MM-DD"> with <Rate currency="X" multiplier="N">value</Rate>.
  // Year archive has multiple <Cube date> blocks. Iterate by block.
  const out: Array<{ date: string; currency: string; rate: number }> = [];
  const cubeRe = /<Cube[^>]*date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Cube>/g;
  const rateRe = /<Rate currency="([A-Z]+)"(?:\s+multiplier="(\d+)")?>([\d.]+)<\/Rate>/g;
  let cm: RegExpExecArray | null;
  while ((cm = cubeRe.exec(xml)) !== null) {
    const date = cm[1];
    const inner = cm[2];
    let rm: RegExpExecArray | null;
    while ((rm = rateRe.exec(inner)) !== null) {
      const currency = rm[1];
      const multiplier = rm[2] ? parseInt(rm[2], 10) : 1;
      const value = parseFloat(rm[3]);
      // Normalize: store RON-per-1-unit regardless of BNR's multiplier.
      out.push({ date, currency, rate: value / multiplier });
    }
  }
  return out;
}

async function persistRates(rates: Array<{ date: string; currency: string; rate: number }>): Promise<number> {
  if (rates.length === 0) return 0;
  let inserted = 0;
  // Drizzle has no .onConflictDoNothing chained API across all drivers; loop is fine — tens to hundreds per year.
  for (const r of rates) {
    try {
      await db.insert(bnrRatesDaily).values({
        rateDate: r.date, currency: r.currency, rate: r.rate,
      } as any).onConflictDoNothing();
      inserted++;
    } catch {
      // duplicate — ignore
    }
  }
  return inserted;
}

async function fetchAndPersistYear(year: number): Promise<number> {
  if (yearFetchInflight.has(year)) return yearFetchInflight.get(year)!;
  const p = (async () => {
    const res = await fetch(YEAR_URL(year), { headers: { 'User-Agent': 'facturamea/1.0' } });
    if (!res.ok) throw new Error(`BNR ${year} archive ${res.status}`);
    const xml = await res.text();
    return persistRates(parseRatesXml(xml));
  })();
  yearFetchInflight.set(year, p);
  try { return await p; } finally { yearFetchInflight.delete(year); }
}

async function fetchAndPersistDaily(): Promise<number> {
  const res = await fetch(DAILY_URL, { headers: { 'User-Agent': 'facturamea/1.0' } });
  if (!res.ok) throw new Error(`BNR daily ${res.status}`);
  const xml = await res.text();
  return persistRates(parseRatesXml(xml));
}

/**
 * Get RON-per-1-unit rate for a specific date + currency.
 *
 * Strategy:
 *   1. Direct DB hit for (date, currency).
 *   2. If miss, fetch today's BNR rate (may cover it), retry.
 *   3. If still miss, fetch BNR archive for that year, retry.
 *   4. If still miss (weekend/holiday — BNR doesn't publish), return the
 *      most recent rate ≤ requested date.
 */
export async function getBnrRate(date: string, currency: string): Promise<BnrRate | null> {
  const c = currency.toUpperCase();
  if (c === 'RON') return { date, currency: 'RON', rate: 1, source: 'bnr-daily' };

  // 1. Direct hit
  const [exact] = await db.select().from(bnrRatesDaily)
    .where(and(eq(bnrRatesDaily.rateDate, date), eq(bnrRatesDaily.currency, c)));
  if (exact) return { date: exact.rateDate, currency: exact.currency, rate: exact.rate, source: 'bnr-daily' };

  // 2. Refresh daily feed
  const today = new Date().toISOString().slice(0, 10);
  if (date >= today.slice(0, 7)) {
    // Recent — try the daily feed first.
    try { await fetchAndPersistDaily(); } catch { /* ignore */ }
    const [retry] = await db.select().from(bnrRatesDaily)
      .where(and(eq(bnrRatesDaily.rateDate, date), eq(bnrRatesDaily.currency, c)));
    if (retry) return { date: retry.rateDate, currency: retry.currency, rate: retry.rate, source: 'bnr-daily' };
  }

  // 3. Fetch year archive
  const year = parseInt(date.slice(0, 4), 10);
  try { await fetchAndPersistYear(year); } catch { /* ignore — fall through to nearest */ }
  const [yearHit] = await db.select().from(bnrRatesDaily)
    .where(and(eq(bnrRatesDaily.rateDate, date), eq(bnrRatesDaily.currency, c)));
  if (yearHit) return { date: yearHit.rateDate, currency: yearHit.currency, rate: yearHit.rate, source: 'bnr-year-archive' };

  // 4. Nearest available rate ≤ date (weekends/holidays use the prior business day)
  const [nearest] = await db.select().from(bnrRatesDaily)
    .where(and(eq(bnrRatesDaily.currency, c), lte(bnrRatesDaily.rateDate, date)))
    .orderBy(desc(bnrRatesDaily.rateDate)).limit(1);
  if (nearest) return { date: nearest.rateDate, currency: nearest.currency, rate: nearest.rate, source: 'fallback-nearest' };

  return null;
}

/** Convenience for invoice issuance — captures BNR rate snapshot. */
export async function captureBnrSnapshot(issueDate: string, currency: string): Promise<{ rate: number; rateDate: string } | null> {
  if (currency.toUpperCase() === 'RON') return null;
  const r = await getBnrRate(issueDate, currency);
  if (!r) return null;
  return { rate: r.rate, rateDate: r.date };
}
