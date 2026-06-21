// Multi-currency FX. Daily rates from ECB (free, no key, no rate limit).
// Stored in fx_rates table. Falls back gracefully if table is empty.

import { db } from '../db';
import { fxRates } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const ECB_DAILY = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

interface RateMap {
  [iso: string]: number; // EUR -> ISO rate
}

let memCache: { rates: RateMap; fetchedAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

async function fetchEcbRates(): Promise<RateMap | null> {
  try {
    const res = await fetch(ECB_DAILY, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const xml = await res.text();
    // Quick regex parse — XML is small + flat (<Cube currency="USD" rate="1.08"/>)
    const map: RateMap = { EUR: 1 };
    const re = /<Cube\s+currency="([A-Z]{3})"\s+rate="([0-9.]+)"\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) map[m[1]] = parseFloat(m[2]);
    return map;
  } catch { return null; }
}

async function loadRatesFromDb(): Promise<RateMap | null> {
  try {
    const rows = await db.select().from(fxRates).where(eq(fxRates.baseCurrency, 'EUR'));
    if (rows.length === 0) return null;
    const map: RateMap = { EUR: 1 };
    for (const r of rows) map[r.quoteCurrency] = r.rate;
    return map;
  } catch { return null; }
}

async function persistRates(rates: RateMap) {
  try {
    const now = new Date();
    for (const [code, rate] of Object.entries(rates)) {
      if (code === 'EUR') continue;
      await db.insert(fxRates).values({
        baseCurrency: 'EUR', quoteCurrency: code, rate, fetchedAt: now, source: 'ecb',
      } as any).onConflictDoUpdate({
        target: [fxRates.baseCurrency, fxRates.quoteCurrency],
        set: { rate, fetchedAt: now },
      });
    }
  } catch (err) { console.warn('persistRates failed', err); }
}

export async function getRates(): Promise<RateMap> {
  if (memCache && Date.now() - memCache.fetchedAt < TTL_MS) return memCache.rates;
  // Try DB first (cheap)
  let rates = await loadRatesFromDb();
  if (!rates || Object.keys(rates).length < 5) {
    // DB empty or stale on first call → fetch from ECB and persist
    const fresh = await fetchEcbRates();
    if (fresh) {
      rates = fresh;
      void persistRates(fresh);
    }
  }
  if (!rates) {
    // LAST-RESORT hardcoded baseline — only when both the DB and ECB are
    // unreachable. These are stale, indicative rates; never rely on them for
    // anything fiscal. See the warning in convert().
    console.warn('[fx] using hardcoded fallback FX rates — DB and ECB both unavailable');
    rates = { EUR: 1, RON: 4.97, USD: 1.08, GBP: 0.85 };
  }
  memCache = { rates, fetchedAt: Date.now() };
  return rates;
}

/**
 * Convert an amount between currencies using ECB daily rates (indicative).
 *
 * IMPORTANT: this is for display/estimation only. Do NOT use it for any
 * fiscal, VAT or invoice amount — Romanian law requires the BNR reference
 * rate at the invoice issue date. For those, use lib/bnr-fx.ts
 * (captureBnrSnapshot). ECB rates differ from BNR and would produce
 * incorrect, non-compliant totals.
 */
export async function convert(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;
  const rates = await getRates();
  const f = rates[from.toUpperCase()];
  const t = rates[to.toUpperCase()];
  if (!f || !t) return amount; // unknown currency — return unchanged
  // Convert via EUR pivot
  const eur = amount / f;
  return eur * t;
}

export async function refreshFromEcb(): Promise<{ ok: boolean; count: number }> {
  const fresh = await fetchEcbRates();
  if (!fresh) return { ok: false, count: 0 };
  await persistRates(fresh);
  memCache = { rates: fresh, fetchedAt: Date.now() };
  return { ok: true, count: Object.keys(fresh).length - 1 };
}
