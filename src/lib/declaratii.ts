// Helpers for ANAF fiscal declarations (D394, D300).
//
// These build best-effort, well-structured XML for the two periodic VAT
// declarations a small Romanian company files:
//   - D394: Declarația informativă privind livrările/achizițiile pe teritoriul național
//   - D300: Decont de taxă pe valoarea adăugată
//
// All money is INTEGER cents internally; XML emits RON with 2 decimals.
// The output validates structurally but the final file should always be
// checked against the latest ANAF XSD/PDF-inteligent before submission.

import { db } from '../db';
import { invoiceRonCents } from './invoicing';
import {
  transportInvoices,
  expenses,
  companies,
  billingAddresses,
  suppliers,
} from '../db/schema';
import { and, eq, gte, lte, ne } from 'drizzle-orm';

// XML escaping — identical style to lib/efactura.ts.
export const escapeXml = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

// Cents → "1234.56" string (no thousands separators, for XML).
export const centsToStr = (c: number): string => (c / 100).toFixed(2);

// Normalize a CUI: strip RO prefix + any non-digit, return digits only.
export const normalizeCui = (raw: string | null | undefined): string =>
  (raw ?? '').replace(/^RO/i, '').replace(/\D/g, '');

export interface DeclaratiePeriod {
  /** inclusive start, YYYY-MM-DD */
  from: string;
  /** inclusive end, YYYY-MM-DD */
  to: string;
  month: number; // 1..12 (derived from `from`)
  year: number;
}

// Resolve ?month=&year= or ?from=&to= into a normalized period.
export function resolvePeriod(params: URLSearchParams): DeclaratiePeriod | null {
  const fromQ = params.get('from');
  const toQ = params.get('to');
  if (fromQ && toQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ)) {
    const d = new Date(fromQ + 'T00:00:00Z');
    return { from: fromQ, to: toQ, month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
  }
  const m = Number(params.get('month'));
  const y = Number(params.get('year'));
  if (m >= 1 && m <= 12 && y >= 2000 && y <= 2100) {
    const mm = String(m).padStart(2, '0');
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`, month: m, year: y };
  }
  return null;
}

export interface PartnerLine {
  cui: string;        // normalized digits (may be empty for persoane fizice)
  name: string;
  baseCents: number;  // baza impozabilă
  vatCents: number;   // TVA
  docCount: number;
}

export interface DeclaratieData {
  declarant: {
    cui: string;       // normalized
    name: string;
    rawCui: string | null;
  };
  period: DeclaratiePeriod;
  // Sales (livrări) — issued invoices grouped by client CUI.
  livrari: PartnerLine[];
  livrariTotals: { baseCents: number; vatCents: number; docCount: number };
  // Purchases (achiziții) — expenses grouped by supplier CUI.
  achizitii: PartnerLine[];
  achizitiiTotals: { baseCents: number; vatCents: number; docCount: number };
}

function emptyTotals() {
  return { baseCents: 0, vatCents: 0, docCount: 0 };
}

// Gather + aggregate everything both declarations need for a period.
// Defensive: any DB failure yields empty buckets rather than throwing, so the
// endpoints still return a structurally valid (empty) declaration.
export async function collectDeclaratieData(companyId: string, period: DeclaratiePeriod): Promise<DeclaratieData> {
  let declarantName = '';
  let rawCui: string | null = null;

  try {
    const [issuer] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (issuer) {
      declarantName = issuer.name || '';
      rawCui = issuer.cui || null;
    }
    const [billing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
    if (billing) {
      declarantName = billing.legalName || declarantName;
      rawCui = billing.cui || rawCui;
    }
  } catch { /* keep defaults */ }

  const fromDate = new Date(period.from + 'T00:00:00Z');
  const toDate = new Date(period.to + 'T23:59:59Z');

  // ── Livrări: issued sales invoices (kind factura + storno).
  // Excludes only 'draft' (not yet a fiscal document) and 'voided' (a draft
  // that was discarded before issue). A stornoed original keeps status
  // 'reversed' and MUST stay included: the original (+) and its storno (−)
  // net to zero within the period, so the declaration neither over- nor
  // under-reports. Were the original excluded while the storno is counted,
  // the negative line would push the period below the true figure.
  const livrariMap = new Map<string, PartnerLine>();
  const livrariTotals = emptyTotals();
  try {
    const invoices = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, companyId),
      ne(transportInvoices.status, 'voided'),
      ne(transportInvoices.status, 'draft'),
      gte(transportInvoices.issuedAt, fromDate),
      lte(transportInvoices.issuedAt, toDate),
    ));
    for (const inv of invoices) {
      if (inv.kind !== 'factura' && inv.kind !== 'storno') continue;
      const cui = normalizeCui(inv.clientTaxIdSnap);
      const key = cui || `name:${inv.clientNameSnap}`;
      let line = livrariMap.get(key);
      if (!line) {
        line = { cui, name: inv.clientNameSnap, baseCents: 0, vatCents: 0, docCount: 0 };
        livrariMap.set(key, line);
      }
      const ron = invoiceRonCents(inv);
      line.baseCents += ron.subtotal;
      line.vatCents += ron.vat;
      line.docCount += 1;
      livrariTotals.baseCents += ron.subtotal;
      livrariTotals.vatCents += ron.vat;
      livrariTotals.docCount += 1;
    }
  } catch { /* empty livrari */ }

  // ── Achiziții: expenses of type factura in period.
  const achizitiiMap = new Map<string, PartnerLine>();
  const achizitiiTotals = emptyTotals();
  try {
    const rows = await db.select().from(expenses).where(and(
      eq(expenses.companyId, companyId),
      gte(expenses.issueDate, period.from),
      lte(expenses.issueDate, period.to),
    ));
    // Resolve supplier names/CUI for grouping (best-effort lookup cache).
    const supplierCache = new Map<string, { name: string; cui: string }>();
    for (const exp of rows) {
      // Only count documents that are fiscal purchase invoices for D394.
      if (exp.documentType && exp.documentType !== 'factura') continue;
      let name = exp.supplierNameSnap || '';
      let cui = '';
      if (exp.supplierId) {
        let s = supplierCache.get(exp.supplierId);
        if (!s) {
          try {
            const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, exp.supplierId));
            s = { name: sup?.name || name, cui: normalizeCui(sup?.cui) };
          } catch { s = { name, cui: '' }; }
          supplierCache.set(exp.supplierId, s);
        }
        name = s.name || name;
        cui = s.cui;
      }
      const key = cui || `name:${name || exp.documentNumber || exp.id}`;
      let line = achizitiiMap.get(key);
      if (!line) {
        line = { cui, name: name || 'Furnizor', baseCents: 0, vatCents: 0, docCount: 0 };
        achizitiiMap.set(key, line);
      }
      line.baseCents += exp.netCents;
      line.vatCents += exp.vatCents;
      line.docCount += 1;
      achizitiiTotals.baseCents += exp.netCents;
      achizitiiTotals.vatCents += exp.vatCents;
      achizitiiTotals.docCount += 1;
    }
  } catch { /* empty achizitii */ }

  return {
    declarant: { cui: normalizeCui(rawCui), name: declarantName, rawCui },
    period,
    livrari: Array.from(livrariMap.values()).sort((a, b) => b.baseCents - a.baseCents),
    livrariTotals,
    achizitii: Array.from(achizitiiMap.values()).sort((a, b) => b.baseCents - a.baseCents),
    achizitiiTotals,
  };
}

// ── D394 XML ──────────────────────────────────────────────────────────────
// Declarația informativă 394. ANAF structure (simplified): a declaratie394
// root with an antet (header) carrying declarant cui + period, a rezumat with
// total bases/VAT, and per-partner livrare/achizitie lines. Partners without a
// CUI (persoane fizice) are aggregated into the rezumat only.
export function generateD394Xml(data: DeclaratieData): string {
  const { declarant, period, livrari, livrariTotals, achizitii, achizitiiTotals } = data;

  const livrariB2B = livrari.filter((l) => l.cui);
  const achizitiiB2B = achizitii.filter((l) => l.cui);

  const livrareLines = livrariB2B.map((l) => `
    <livrare>
      <cuiP>${escapeXml(l.cui)}</cuiP>
      <denP>${escapeXml(l.name)}</denP>
      <nrFact>${l.docCount}</nrFact>
      <baza>${centsToStr(l.baseCents)}</baza>
      <tva>${centsToStr(l.vatCents)}</tva>
    </livrare>`).join('');

  const achizitieLines = achizitiiB2B.map((l) => `
    <achizitie>
      <cuiP>${escapeXml(l.cui)}</cuiP>
      <denP>${escapeXml(l.name)}</denP>
      <nrFact>${l.docCount}</nrFact>
      <baza>${centsToStr(l.baseCents)}</baza>
      <tva>${centsToStr(l.vatCents)}</tva>
    </achizitie>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<declaratie394 xmlns="mfp:anaf:dgti:d394:declaratie:v4" luna="${period.month}" an="${period.year}">
  <antet>
    <cui>${escapeXml(declarant.cui)}</cui>
    <den>${escapeXml(declarant.name)}</den>
    <luna>${period.month}</luna>
    <an>${period.year}</an>
    <perioadaDe>${period.from}</perioadaDe>
    <perioadaLa>${period.to}</perioadaLa>
    <sistemTVA>0</sistemTVA>
    <intocmit>facturamea</intocmit>
  </antet>
  <rezumat>
    <totalLivrari nrParteneri="${livrariB2B.length}" nrFacturi="${livrariTotals.docCount}">
      <baza>${centsToStr(livrariTotals.baseCents)}</baza>
      <tva>${centsToStr(livrariTotals.vatCents)}</tva>
    </totalLivrari>
    <totalAchizitii nrParteneri="${achizitiiB2B.length}" nrFacturi="${achizitiiTotals.docCount}">
      <baza>${centsToStr(achizitiiTotals.baseCents)}</baza>
      <tva>${centsToStr(achizitiiTotals.vatCents)}</tva>
    </totalAchizitii>
  </rezumat>
  <livrari>${livrareLines}
  </livrari>
  <achizitii>${achizitieLines}
  </achizitii>
</declaratie394>`;
}

// ── D300 (Decont TVA) ───────────────────────────────────────────────────────
// Simplified Decont de TVA. Maps to the key rânduri:
//   TVA colectată  (din livrări)         -> rd. 16 group
//   TVA deductibilă (din achiziții)      -> rd. 25 group
//   Sold = colectată - deductibilă       -> de plată (rd. 33) or de recuperat (rd. 35)
export interface D300Summary {
  baseColectataCents: number;
  tvaColectataCents: number;
  baseDeductibilaCents: number;
  tvaDeductibilaCents: number;
  soldCents: number;       // colectată - deductibilă (pozitiv = de plată)
  dePlataCents: number;
  deRecuperatCents: number;
}

export function computeD300Summary(data: DeclaratieData): D300Summary {
  const tvaColectataCents = data.livrariTotals.vatCents;
  const tvaDeductibilaCents = data.achizitiiTotals.vatCents;
  const soldCents = tvaColectataCents - tvaDeductibilaCents;
  return {
    baseColectataCents: data.livrariTotals.baseCents,
    tvaColectataCents,
    baseDeductibilaCents: data.achizitiiTotals.baseCents,
    tvaDeductibilaCents,
    soldCents,
    dePlataCents: soldCents > 0 ? soldCents : 0,
    deRecuperatCents: soldCents < 0 ? -soldCents : 0,
  };
}

export function generateD300Xml(data: DeclaratieData): string {
  const { declarant, period } = data;
  const s = computeD300Summary(data);
  return `<?xml version="1.0" encoding="UTF-8"?>
<declaratie300 xmlns="mfp:anaf:dgti:d300:declaratie:v1" luna="${period.month}" an="${period.year}">
  <antet>
    <cui>${escapeXml(declarant.cui)}</cui>
    <den>${escapeXml(declarant.name)}</den>
    <luna>${period.month}</luna>
    <an>${period.year}</an>
    <perioadaDe>${period.from}</perioadaDe>
    <perioadaLa>${period.to}</perioadaLa>
    <intocmit>facturamea</intocmit>
  </antet>
  <tvaColectata>
    <baza>${centsToStr(s.baseColectataCents)}</baza>
    <tva>${centsToStr(s.tvaColectataCents)}</tva>
  </tvaColectata>
  <tvaDeductibila>
    <baza>${centsToStr(s.baseDeductibilaCents)}</baza>
    <tva>${centsToStr(s.tvaDeductibilaCents)}</tva>
  </tvaDeductibila>
  <regularizari>
    <sold>${centsToStr(s.soldCents)}</sold>
    <tvaDePlata>${centsToStr(s.dePlataCents)}</tvaDePlata>
    <tvaDeRecuperat>${centsToStr(s.deRecuperatCents)}</tvaDeRecuperat>
  </regularizari>
</declaratie300>`;
}

// CSV alternative for the D300 (human-readable summary).
export function generateD300Csv(data: DeclaratieData): string {
  const s = computeD300Summary(data);
  const rows: Array<[string, string]> = [
    ['Declarant', data.declarant.name],
    ['CUI', data.declarant.cui],
    ['Perioada', `${data.period.from} .. ${data.period.to}`],
    ['Baza impozabila livrari (RON)', centsToStr(s.baseColectataCents)],
    ['TVA colectata (RON)', centsToStr(s.tvaColectataCents)],
    ['Baza impozabila achizitii (RON)', centsToStr(s.baseDeductibilaCents)],
    ['TVA deductibila (RON)', centsToStr(s.tvaDeductibilaCents)],
    ['Sold TVA (RON)', centsToStr(s.soldCents)],
    ['TVA de plata (RON)', centsToStr(s.dePlataCents)],
    ['TVA de recuperat (RON)', centsToStr(s.deRecuperatCents)],
  ];
  const escCsv = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  return rows.map(([k, v]) => `${escCsv(k)},${escCsv(v)}`).join('\r\n') + '\r\n';
}
