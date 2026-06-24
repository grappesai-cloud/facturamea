import { db } from '../db';
import { invoiceSeries, companies, billingAddresses } from '../db/schema';
import { and, eq, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Build the invoice issuer = company (logo/stamp/signature/footer assets) merged
// with the default billing profile (legal name, CUI, reg. com., IBAN, bank).
// IBAN + reg. com. live on `billing_addresses`, NOT on `companies` — so any
// render that reads only `companies` silently drops them (no IBAN on invoices).
// Use this in every invoice render path so the issuer block is complete.
export async function loadIssuer(companyId: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return null;
  const [billing] = await db.select().from(billingAddresses)
    .where(eq(billingAddresses.companyId, companyId))
    .orderBy(desc(billingAddresses.isDefault))
    .limit(1);
  return {
    ...company,
    name: billing?.legalName || company.name,
    cui: billing?.cui || company.cui,
    regCom: billing?.regCom ?? null,
    iban: billing?.iban ?? null,
    bank: billing?.bank ?? null,
    address: billing?.address || company.address,
  };
}

// Minimal shape shared by the global `db` handle and a transaction `tx`, so
// number reservation / series bootstrap can run inside a caller's transaction
// (keeping reservation + invoice insert atomic — a rolled-back insert also
// rolls back the consumed number, avoiding gaps).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbLike = typeof db | Tx;

export type InvoiceKind = 'factura' | 'proforma' | 'storno' | 'chitanta';

export const INVOICE_KIND_LABELS: Record<InvoiceKind, string> = {
  factura: 'Factură',
  proforma: 'Proformă',
  storno: 'Factură storno',
  chitanta: 'Chitanță',
};

// How a series prefix + sequence number are rendered into a full document
// number. Default keeps the legacy `PREFIX-N` (used by order numbering); the
// invoicing flow passes INVOICE_NUMBER_FORMAT for Oblio-style `PREFIX 0001`.
export interface NumberFormat { separator?: string; pad?: number }
export const INVOICE_NUMBER_FORMAT: NumberFormat = { separator: ' ', pad: 4 };

export function formatSeriesNumber(prefix: string, n: number, fmt: NumberFormat = {}): string {
  const sep = fmt.separator ?? '-';
  const pad = fmt.pad ?? 0;
  return `${prefix}${sep}${String(n).padStart(pad, '0')}`;
}

// Atomically reserve the next sequence number on a given series. Uses an UPDATE
// ... RETURNING to avoid races between concurrent issuers on the same series.
export async function nextSeriesNumber(seriesId: string, fmt: NumberFormat = {}, executor: DbLike = db): Promise<{ prefix: string; number: number; fullNumber: string }> {
  const [row] = await executor
    .update(invoiceSeries)
    .set({ nextNumber: sql`${invoiceSeries.nextNumber} + 1` })
    .where(eq(invoiceSeries.id, seriesId))
    .returning({ prefix: invoiceSeries.prefix, nextNumber: invoiceSeries.nextNumber });
  if (!row) throw new Error('Series not found');
  // After increment, the *previous* value is what we just reserved.
  const reserved = row.nextNumber - 1;
  return { prefix: row.prefix, number: reserved, fullNumber: formatSeriesNumber(row.prefix, reserved, fmt) };
}

// Fetches the default series for a company+kind, creating a sensible default
// if none exists yet (first-time invoicing experience).
export async function ensureDefaultSeries(
  companyId: string,
  kind: InvoiceKind,
  scope?: 'platform' | 'external' | null,
  executor: DbLike = db,
): Promise<{ id: string; prefix: string }> {
  // Two concurrent series per kind are supported (one for platform/TH orders,
  // one for external clients). Prefer the default whose scope matches; else any
  // default for the kind (scope null = applies to both).
  const defaultRows = await executor
    .select({ id: invoiceSeries.id, prefix: invoiceSeries.prefix, scope: invoiceSeries.scope })
    .from(invoiceSeries)
    .where(and(
      eq(invoiceSeries.companyId, companyId),
      eq(invoiceSeries.kind, kind),
      eq(invoiceSeries.isDefault, true),
    ));
  if (defaultRows.length) {
    const scoped = scope ? defaultRows.find((s) => s.scope === scope) : null;
    const pick = scoped || defaultRows.find((s) => !s.scope) || defaultRows[0];
    return { id: pick.id, prefix: pick.prefix };
  }

  const defaults: Record<InvoiceKind, { name: string; prefix: string }> = {
    factura: { name: 'Serie facturi', prefix: 'TH' },
    proforma: { name: 'Serie proforme', prefix: 'PF' },
    storno: { name: 'Serie storno', prefix: 'ST' },
    chitanta: { name: 'Serie chitanțe', prefix: 'CH' },
  };
  const id = nanoid();
  await executor.insert(invoiceSeries).values({
    id,
    companyId,
    name: defaults[kind].name,
    prefix: defaults[kind].prefix,
    kind,
    nextNumber: 1,
    isDefault: true,
  });
  return { id, prefix: defaults[kind].prefix };
}

// RON value of an invoice's amounts. Declarations (D300/D394/D390/SAF-T) and the
// double-entry ledger MUST report in RON, so callers aggregate THESE, never the
// raw foreign-currency cents. Uses the frozen RON snapshot when present, else
// converts the currency cents at the captured BNR rate (RON invoices convert 1:1;
// legacy non-RON rows with no rate fall back to face value).
export function invoiceRonCents(inv: {
  currency?: string | null; bnrRate?: number | null;
  subtotalRonCents?: number | null; vatRonCents?: number | null; totalRonCents?: number | null;
  subtotalCents?: number | null; vatCents?: number | null; totalCents?: number | null;
}): { subtotal: number; vat: number; total: number } {
  const rate = inv.currency && inv.currency !== 'RON' ? (inv.bnrRate || 1) : 1;
  const c = (snap: number | null | undefined, cents: number | null | undefined) =>
    snap != null ? snap : Math.round((cents || 0) * rate);
  return {
    subtotal: c(inv.subtotalRonCents, inv.subtotalCents),
    vat: c(inv.vatRonCents, inv.vatCents),
    total: c(inv.totalRonCents, inv.totalCents),
  };
}

// RON-equivalent of an expense (achiziție) for declarations. Non-RON expenses are
// converted at their frozen BNR rate; RON expenses pass through 1:1.
export function expenseRonCents(exp: {
  currency?: string | null; bnrRate?: number | null;
  netCents?: number | null; vatCents?: number | null; totalCents?: number | null;
}): { net: number; vat: number; total: number } {
  const rate = exp.currency && exp.currency !== 'RON' ? (Number(exp.bnrRate) || 1) : 1;
  return {
    net: Math.round((exp.netCents || 0) * rate),
    vat: Math.round((exp.vatCents || 0) * rate),
    total: Math.round((exp.totalCents || 0) * rate),
  };
}
