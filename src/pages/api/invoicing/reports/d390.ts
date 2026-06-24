// GET /api/invoicing/reports/d390?month=&year=  (or ?from=&to=)
// Declarația recapitulativă 390 (VIES) — intra-EU operations.
//
// Aggregates:
//   L (livrări intracomunitare de bunuri)   — sales invoices to EU clients
//   A (achiziții intracomunitare de bunuri)  — expenses from EU suppliers
// grouped by partner VAT id (țară + cod). Only counts partners outside Romania
// that carry a VAT id. Returns a well-formed D390 XML download.
//
// Best-effort structure — validate against the latest ANAF XSD before filing.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines, expenses, invoiceClients, suppliers, companies, billingAddresses } from '../../../../db/schema';
import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { resolvePeriod, escapeXml, centsToStr, normalizeCui } from '../../../../lib/declaratii';
import { invoiceRonCents, expenseRonCents } from '../../../../lib/invoicing';

// Intra-EU operation type: 'L'=goods deliveries, 'P'=service supplies. We infer
// services when every line's unit is service-like (no goods units present).
const SERVICE_UNITS = new Set(['serviciu', 'oră', 'ora', 'ore', 'abonament', 'lună', 'luna', 'zi', 'an', 'h', 'HUR', '%']);
async function isServiceInvoice(invoiceId: string): Promise<boolean> {
  try {
    const ls = await db.select({ unit: transportInvoiceLines.unit }).from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, invoiceId));
    return ls.length > 0 && ls.every((l) => SERVICE_UNITS.has(String(l.unit || '').toLowerCase()));
  } catch { return false; }
}

// EU member-state ISO-2 codes (VAT prefixes; EL = Greece for VAT). RO excluded
// because it's the declarant's own country.
const EU_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'EL', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'SK', 'SI', 'ES', 'SE',
]);

// Map a free-text country name to an ISO-2 EU code (best-effort). Returns null
// for Romania or unknown/non-EU countries.
function countryToEuCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const c = country.trim().toUpperCase();
  if (!c) return null;
  if (c === 'ROMANIA' || c === 'RO' || c === 'ROUMANIE' || c === 'ROMÂNIA') return null;
  // Already an ISO-2 code?
  if (c.length === 2 && EU_CODES.has(c)) return c === 'GR' ? 'EL' : c;
  const NAMES: Record<string, string> = {
    'AUSTRIA': 'AT', 'BELGIUM': 'BE', 'BELGIA': 'BE', 'BULGARIA': 'BG', 'CROATIA': 'HR', 'CROAȚIA': 'HR',
    'CYPRUS': 'CY', 'CIPRU': 'CY', 'CZECH REPUBLIC': 'CZ', 'CEHIA': 'CZ', 'DENMARK': 'DK', 'DANEMARCA': 'DK',
    'ESTONIA': 'EE', 'FINLAND': 'FI', 'FINLANDA': 'FI', 'FRANCE': 'FR', 'FRANȚA': 'FR', 'FRANTA': 'FR',
    'GERMANY': 'DE', 'GERMANIA': 'DE', 'GREECE': 'EL', 'GRECIA': 'EL', 'HUNGARY': 'HU', 'UNGARIA': 'HU',
    'IRELAND': 'IE', 'IRLANDA': 'IE', 'ITALY': 'IT', 'ITALIA': 'IT', 'LATVIA': 'LV', 'LETONIA': 'LV',
    'LITHUANIA': 'LT', 'LITUANIA': 'LT', 'LUXEMBOURG': 'LU', 'LUXEMBURG': 'LU', 'MALTA': 'MT',
    'NETHERLANDS': 'NL', 'OLANDA': 'NL', 'POLAND': 'PL', 'POLONIA': 'PL', 'PORTUGAL': 'PT', 'PORTUGALIA': 'PT',
    'SLOVAKIA': 'SK', 'SLOVACIA': 'SK', 'SLOVENIA': 'SI', 'SPAIN': 'ES', 'SPANIA': 'ES', 'SWEDEN': 'SE', 'SUEDIA': 'SE',
  };
  return NAMES[c] || (EU_CODES.has(c) ? c : null);
}

// Split a VAT id into a 2-letter country prefix + digits. Falls back to the
// supplied country code when the VAT id has no recognizable prefix.
function splitVat(rawVat: string | null | undefined, fallbackCode: string | null): { code: string | null; number: string } {
  const v = (rawVat ?? '').replace(/\s+/g, '').toUpperCase();
  const m = v.match(/^([A-Z]{2})(.+)$/);
  if (m && EU_CODES.has(m[1])) return { code: m[1], number: m[2].replace(/[^0-9A-Z]/g, '') };
  // No prefix — use the partner's country and strip non-alphanumerics.
  return { code: fallbackCode, number: v.replace(/[^0-9A-Z]/g, '') };
}

interface RecapLine {
  code: string;       // partner country ISO-2
  vat: string;        // partner VAT number (without country prefix)
  type: 'L' | 'A' | 'P' | 'T';    // L=goods deliv, P=service deliv, A=goods acq, T=service acq
  baseCents: number;
  docCount: number;
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const companyId = locals.user.companyId;

  const period = resolvePeriod(url.searchParams);
  if (!period) {
    return new Response(JSON.stringify({ error: 'Perioadă invalidă. Folosește ?month=1..12&year= sau ?from=YYYY-MM-DD&to=YYYY-MM-DD' }), { status: 400 });
  }

  // Declarant identity.
  let declarantName = '';
  let rawCui: string | null = null;
  try {
    const [issuer] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (issuer) { declarantName = issuer.name || ''; rawCui = issuer.cui || null; }
    const [billing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
    if (billing) { declarantName = billing.legalName || declarantName; rawCui = billing.cui || rawCui; }
  } catch { /* defaults */ }

  const fromDate = new Date(period.from + 'T00:00:00Z');
  const toDate = new Date(period.to + 'T23:59:59Z');

  const linesMap = new Map<string, RecapLine>();
  const addLine = (code: string, vat: string, type: 'L' | 'A' | 'P' | 'T', baseCents: number) => {
    const key = `${type}|${code}|${vat}`;
    let line = linesMap.get(key);
    if (!line) { line = { code, vat, type, baseCents: 0, docCount: 0 }; linesMap.set(key, line); }
    line.baseCents += baseCents;
    line.docCount += 1;
  };

  // ── L: intra-EU sales (livrări) — invoices to EU external clients ──
  try {
    const clientCache = new Map<string, { country: string | null; vat: string | null }>();
    const invoices = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, companyId),
      ne(transportInvoices.status, 'voided'),
      ne(transportInvoices.status, 'draft'),
      gte(transportInvoices.issuedAt, fromDate),
      lte(transportInvoices.issuedAt, toDate),
    ));
    for (const inv of invoices) {
      if (inv.kind !== 'factura' && inv.kind !== 'storno') continue;
      let country: string | null = null;
      let vatRaw: string | null = inv.clientTaxIdSnap || null;
      if (inv.clientExternalId) {
        let c = clientCache.get(inv.clientExternalId);
        if (!c) {
          try {
            const [cl] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId));
            c = { country: cl?.country || null, vat: cl?.taxId || vatRaw };
          } catch { c = { country: null, vat: vatRaw }; }
          clientCache.set(inv.clientExternalId, c);
        }
        country = c.country;
        vatRaw = c.vat || vatRaw;
      }
      const euCode = countryToEuCode(country) || (() => {
        const s = splitVat(vatRaw, null);
        return s.code;
      })();
      if (!euCode) continue; // not an intra-EU partner
      const { code, number } = splitVat(vatRaw, euCode);
      if (!code || !number) continue;
      const opType = (await isServiceInvoice(inv.id)) ? 'P' : 'L'; // P = services, L = goods
      addLine(code, number, opType, invoiceRonCents(inv).subtotal);
    }
  } catch { /* skip livrari */ }

  // ── A: intra-EU acquisitions (achiziții) — expenses from EU suppliers ──
  try {
    const supplierCache = new Map<string, { country: string | null; vat: string | null }>();
    const rows = await db.select().from(expenses).where(and(
      eq(expenses.companyId, companyId),
      gte(expenses.issueDate, period.from),
      lte(expenses.issueDate, period.to),
    ));
    for (const exp of rows) {
      if (exp.documentType && exp.documentType !== 'factura') continue;
      if (!exp.supplierId) continue;
      let s = supplierCache.get(exp.supplierId);
      if (!s) {
        try {
          const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, exp.supplierId));
          s = { country: (sup as any)?.country || null, vat: (sup as any)?.cui || null };
        } catch { s = { country: null, vat: null }; }
        supplierCache.set(exp.supplierId, s);
      }
      const euCode = countryToEuCode(s.country) || splitVat(s.vat, null).code;
      if (!euCode) continue;
      const { code, number } = splitVat(s.vat, euCode);
      if (!code || !number) continue;
      addLine(code, number, 'A', expenseRonCents(exp).net);
    }
  } catch { /* skip achizitii */ }

  const lines = Array.from(linesMap.values()).sort((a, b) => (a.type === b.type ? b.baseCents - a.baseCents : a.type < b.type ? -1 : 1));
  const totals = lines.reduce((acc, l) => { acc.baseCents += l.baseCents; acc.count += 1; return acc; }, { baseCents: 0, count: 0 });

  const declarantCui = normalizeCui(rawCui);

  const rezumat = lines.map((l) => `
    <op>
      <tip>${escapeXml(l.type)}</tip>
      <tara>${escapeXml(l.code)}</tara>
      <codP>${escapeXml(l.vat)}</codP>
      <denP></denP>
      <baza>${centsToStr(l.baseCents)}</baza>
      <nrOp>${l.docCount}</nrOp>
    </op>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<declaratie390 xmlns="mfp:anaf:dgti:d390:declaratie:v3" luna="${period.month}" an="${period.year}">
  <antet>
    <cui>${escapeXml(declarantCui)}</cui>
    <den>${escapeXml(declarantName)}</den>
    <luna>${period.month}</luna>
    <an>${period.year}</an>
    <perioadaDe>${period.from}</perioadaDe>
    <perioadaLa>${period.to}</perioadaLa>
    <nrOperatiuni>${totals.count}</nrOperatiuni>
    <totalBaza>${centsToStr(totals.baseCents)}</totalBaza>
    <intocmit>facturamea</intocmit>
  </antet>
  <operatiuni>${rezumat}
  </operatiuni>
</declaratie390>`;

  const filename = `D390_${period.year}_${String(period.month).padStart(2, '0')}.xml`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
