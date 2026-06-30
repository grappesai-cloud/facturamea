// Jurnal de vânzări / Jurnal de cumpărări (VAT journals) — the printable per-
// document VAT registers SAGA produces. Each row is one fiscal document with its
// base + VAT split by rate (19/11/9/5/0…), in RON. Sales come from issued
// invoices (factura + storno), purchases from expenses (documentType=factura).
// Reuses the same RON-conversion + CUI normalization as the declarations so the
// totals reconcile with D300/D394.
import { db } from '../db';
import { transportInvoices, transportInvoiceLines, expenses, suppliers, companies, billingAddresses } from '../db/schema';
import { and, eq, ne, gte, lte, inArray } from 'drizzle-orm';
import { invoiceRonCents, expenseRonCents } from './invoicing';
import { normalizeCui, type DeclaratiePeriod } from './declaratii';

type RateMap = Record<string, { base: number; vat: number }>;

export interface VatJournalRow {
  date: string;       // YYYY-MM-DD
  doc: string;        // full document number
  partner: string;
  cui: string;
  byRate: RateMap;    // keyed by rate percent as string ("19", "9", "0"…)
  baseCents: number;
  vatCents: number;
  totalCents: number;
  note?: string;      // storno / taxare inversă / TVA la încasare / scutit
}
export interface VatJournalSide {
  rows: VatJournalRow[];
  totals: { byRate: RateMap; baseCents: number; vatCents: number; totalCents: number };
}
export interface VatJournal {
  declarant: { name: string; cui: string };
  period: DeclaratiePeriod;
  rates: string[];    // distinct rate columns across both sides, desc
  sales: VatJournalSide;
  purchases: VatJournalSide;
}

function addRate(acc: RateMap, rate: string, base: number, vat: number) {
  const r = acc[rate] || (acc[rate] = { base: 0, vat: 0 });
  r.base += base; r.vat += vat;
}
const emptySide = (): VatJournalSide => ({ rows: [], totals: { byRate: {}, baseCents: 0, vatCents: 0, totalCents: 0 } });

const REGIME_NOTE: Record<string, string> = {
  reverse_charge: 'taxare inversă',
  exempt: 'scutit',
  export_extra_eu: 'export',
  intra_eu: 'intra-UE',
  tva_la_incasare: 'TVA la încasare',
};

export async function collectVatJournal(companyId: string, period: DeclaratiePeriod): Promise<VatJournal> {
  let name = '';
  let cui = '';
  try {
    const [co] = await db.select().from(companies).where(eq(companies.id, companyId));
    name = co?.name || ''; cui = normalizeCui(co?.cui);
    const [b] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
    if (b) { name = b.legalName || name; cui = normalizeCui(b.cui) || cui; }
  } catch { /* keep defaults */ }

  const fromDate = new Date(period.from + 'T00:00:00Z');
  const toDate = new Date(period.to + 'T23:59:59Z');
  const rateSet = new Set<string>();

  // ── Jurnal de vânzări (issued invoices) ──
  const sales = emptySide();
  try {
    const invs = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, companyId),
      ne(transportInvoices.status, 'voided'),
      ne(transportInvoices.status, 'draft'),
      gte(transportInvoices.issuedAt, fromDate),
      lte(transportInvoices.issuedAt, toDate),
    ));
    const fiscal = invs.filter((i) => i.kind === 'factura' || i.kind === 'storno');
    const ids = fiscal.map((i) => i.id);
    const linesByInv = new Map<string, any[]>();
    if (ids.length) {
      const lines = await db.select().from(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, ids));
      for (const ln of lines) { const a = linesByInv.get(ln.invoiceId) || []; a.push(ln); linesByInv.set(ln.invoiceId, a); }
    }
    fiscal.sort((a, b) => Number(new Date(a.issuedAt as any)) - Number(new Date(b.issuedAt as any)));
    for (const inv of fiscal) {
      const cur = inv.currency && inv.currency !== 'RON' ? (inv.bnrRate || 1) : 1;
      const byRate: RateMap = {};
      let base = 0; let vat = 0;
      const lns = linesByInv.get(inv.id) || [];
      for (const ln of lns) {
        const rPct = Number(ln.vatRate) || 0;
        const b = Math.round((ln.lineTotalCents || 0) * cur);
        const v = Math.round(b * rPct / 100);
        addRate(byRate, String(rPct), b, v); base += b; vat += v; rateSet.add(String(rPct));
      }
      if (!lns.length) {
        const ron = invoiceRonCents(inv);
        const rPct = ron.subtotal ? Math.round(ron.vat / ron.subtotal * 100) : 0;
        addRate(byRate, String(rPct), ron.subtotal, ron.vat); base = ron.subtotal; vat = ron.vat; rateSet.add(String(rPct));
      }
      sales.rows.push({
        date: String(inv.issuedAt instanceof Date ? inv.issuedAt.toISOString() : inv.issuedAt).slice(0, 10),
        doc: inv.fullNumber || inv.id.slice(0, 8),
        partner: inv.clientNameSnap || '',
        cui: normalizeCui(inv.clientTaxIdSnap),
        byRate, baseCents: base, vatCents: vat, totalCents: base + vat,
        note: inv.kind === 'storno' ? 'storno' : REGIME_NOTE[inv.vatRegime || ''],
      });
      for (const [r, val] of Object.entries(byRate)) addRate(sales.totals.byRate, r, val.base, val.vat);
      sales.totals.baseCents += base; sales.totals.vatCents += vat; sales.totals.totalCents += base + vat;
    }
  } catch { /* empty sales */ }

  // ── Jurnal de cumpărări (expenses, fiscal invoices only) ──
  const purchases = emptySide();
  try {
    const rows = await db.select().from(expenses).where(and(
      eq(expenses.companyId, companyId),
      gte(expenses.issueDate, period.from),
      lte(expenses.issueDate, period.to),
    ));
    const supCache = new Map<string, { name: string; cui: string }>();
    const fiscal = rows.filter((e) => !e.documentType || e.documentType === 'factura');
    fiscal.sort((a, b) => String(a.issueDate).localeCompare(String(b.issueDate)));
    for (const exp of fiscal) {
      const er = expenseRonCents(exp);
      const rPct = er.net ? Math.round(er.vat / er.net * 100) : 0;
      const byRate: RateMap = {};
      addRate(byRate, String(rPct), er.net, er.vat); rateSet.add(String(rPct));

      let pname = exp.supplierNameSnap || '';
      let pcui = '';
      if (exp.supplierId) {
        let s = supCache.get(exp.supplierId);
        if (!s) {
          try { const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, exp.supplierId)); s = { name: sup?.name || pname, cui: normalizeCui(sup?.cui) }; }
          catch { s = { name: pname, cui: '' }; }
          supCache.set(exp.supplierId, s);
        }
        pname = s.name || pname; pcui = s.cui;
      }
      purchases.rows.push({
        date: String(exp.issueDate).slice(0, 10),
        doc: exp.documentNumber || exp.id.slice(0, 8),
        partner: pname || 'Furnizor',
        cui: pcui,
        byRate, baseCents: er.net, vatCents: er.vat, totalCents: er.total,
        note: exp.vatScheme === 'reverse_charge' ? 'taxare inversă' : ((exp.deductiblePct ?? 100) < 100 ? `deductibil ${exp.deductiblePct}%` : undefined),
      });
      for (const [r, val] of Object.entries(byRate)) addRate(purchases.totals.byRate, r, val.base, val.vat);
      purchases.totals.baseCents += er.net; purchases.totals.vatCents += er.vat; purchases.totals.totalCents += er.total;
    }
  } catch { /* empty purchases */ }

  const rates = Array.from(rateSet).map(Number).sort((a, b) => b - a).map(String);
  return { declarant: { name, cui }, period, rates, sales, purchases };
}
