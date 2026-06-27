// Deterministic pre-ANAF anomaly checks — NO AI, zero cost, pure SQL/JS over our
// own data. Surfaces likely mistakes BEFORE they reach a declaration: duplicate
// documents, foreign acquisitions missing reverse charge, issued invoices never
// sent to ANAF, and non-VAT-payers crossing the registration threshold.
import { db } from '../db';
import { transportInvoices, expenses, suppliers, companies } from '../db/schema';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';

export interface Anomaly {
  kind: string;
  severity: 'high' | 'warn' | 'info';
  title: string;
  detail: string;
  href?: string;
}

const RO = new Set(['', 'romania', 'românia', 'ro']);
const fold = (s: string | null | undefined) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export async function detectAnomalies(companyId: string): Promise<Anomaly[]> {
  const out: Anomaly[] = [];

  // 1. Duplicate invoices — same client + same total, issued within 31 days.
  try {
    const invs = await db.select({
      id: transportInvoices.id, fullNumber: transportInvoices.fullNumber,
      client: transportInvoices.clientNameSnap, total: transportInvoices.totalCents,
      issuedAt: transportInvoices.issuedAt,
    }).from(transportInvoices)
      .where(and(eq(transportInvoices.companyId, companyId), eq(transportInvoices.kind, 'factura'),
        inArray(transportInvoices.status, ['issued', 'sent', 'partial', 'overdue', 'paid'])))
      .limit(3000);
    const groups = new Map<string, typeof invs>();
    for (const i of invs) {
      const key = `${fold(i.client)}|${i.total}`;
      (groups.get(key) || groups.set(key, []).get(key)!).push(i);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      // Only flag when at least two are close in time (likely a real double-issue).
      const dates = g.map((x) => (x.issuedAt ? new Date(x.issuedAt).getTime() : 0)).sort();
      const close = dates.some((d, idx) => idx > 0 && d && dates[idx - 1] && (d - dates[idx - 1]) <= 31 * 86400000);
      if (!close) continue;
      out.push({
        kind: 'dup_invoice', severity: 'warn',
        title: `Posibile facturi duplicate către ${g[0].client || 'client'}`,
        detail: `${g.length} facturi cu aceeași sumă (${g.map((x) => x.fullNumber).join(', ')}).`,
        href: '/app/facturare',
      });
    }
  } catch { /* skip */ }

  // 2. Duplicate expenses — same supplier + same document number.
  try {
    const exps = await db.select({
      supplier: expenses.supplierNameSnap, doc: expenses.documentNumber,
    }).from(expenses)
      .where(and(eq(expenses.companyId, companyId), isNotNull(expenses.documentNumber)))
      .limit(3000);
    const seen = new Map<string, number>();
    for (const e of exps) {
      const key = `${fold(e.supplier)}|${fold(e.doc)}`;
      if (!fold(e.doc)) continue;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, n]) => n > 1).length;
    if (dups > 0) {
      out.push({
        kind: 'dup_expense', severity: 'warn',
        title: `${dups} ${dups === 1 ? 'cheltuială introdusă' : 'cheltuieli introduse'} de două ori`,
        detail: 'Același furnizor și același număr de document apar pe mai multe cheltuieli.',
        href: '/app/cheltuieli',
      });
    }
  } catch { /* skip */ }

  // 3. Foreign-supplier expenses missing reverse charge (taxare inversă).
  try {
    const [r] = await db.select({ n: sql<number>`count(*)` })
      .from(expenses).innerJoin(suppliers, eq(suppliers.id, expenses.supplierId))
      .where(and(eq(expenses.companyId, companyId), isNotNull(suppliers.country),
        sql`lower(${suppliers.country}) NOT IN ('romania', 'românia', 'ro')`,
        sql`COALESCE(${expenses.vatScheme}, 'normal') <> 'reverse_charge'`));
    const n = Number(r?.n || 0);
    if (n > 0) {
      out.push({
        kind: 'reverse_charge_missing', severity: 'high',
        title: `${n} ${n === 1 ? 'cheltuială externă fără' : 'cheltuieli externe fără'} taxare inversă`,
        detail: 'Achizițiile de la furnizori non-RO (intra-UE / non-UE) ar trebui marcate cu taxare inversă pentru TVA corect.',
        href: '/app/cheltuieli',
      });
    }
  } catch { /* skip */ }

  // 4. Issued invoices never sent to ANAF (e-Factura), older than 7 days.
  try {
    const cutoff = new Date(Date.now() - 7 * 86400000);
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(transportInvoices)
      .where(and(eq(transportInvoices.companyId, companyId), eq(transportInvoices.kind, 'factura'),
        inArray(transportInvoices.status, ['issued', 'sent', 'partial', 'overdue', 'paid']),
        sql`(${transportInvoices.efacturaStatus} IS NULL OR ${transportInvoices.efacturaStatus} = '')`,
        sql`${transportInvoices.issuedAt} < ${cutoff}`));
    const n = Number(r?.n || 0);
    if (n > 0) {
      out.push({
        kind: 'efactura_unsent', severity: 'high',
        title: `${n} ${n === 1 ? 'factură netrimisă' : 'facturi netrimise'} la ANAF`,
        detail: 'e-Factura e obligatorie B2B. Aceste facturi mai vechi de 7 zile nu au ajuns în SPV.',
        href: '/app/facturare',
      });
    }
  } catch { /* skip */ }

  // 5. Non-VAT-payer approaching / over the 300.000 lei registration threshold.
  try {
    const [co] = await db.select({ isVatPayer: companies.isVatPayer }).from(companies).where(eq(companies.id, companyId)).limit(1);
    if (co && co.isVatPayer === false) {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const [r] = await db.select({ s: sql<number>`COALESCE(SUM(${transportInvoices.totalCents}), 0)` })
        .from(transportInvoices)
        .where(and(eq(transportInvoices.companyId, companyId), eq(transportInvoices.kind, 'factura'),
          inArray(transportInvoices.status, ['issued', 'sent', 'partial', 'overdue', 'paid']),
          sql`${transportInvoices.issuedAt} >= ${yearStart}`));
      const ytd = Number(r?.s || 0);
      const plafon = 300_000 * 100;
      if (ytd >= plafon) {
        out.push({ kind: 'vat_threshold_over', severity: 'high', title: 'Plafonul de TVA (300.000 lei) a fost depășit', detail: `Cifra de afaceri anuală este ${(ytd / 100).toLocaleString('ro-RO')} lei. Ai obligația să te înregistrezi în scopuri de TVA.`, href: '/app/setari/companie' });
      } else if (ytd >= plafon * 0.9) {
        out.push({ kind: 'vat_threshold_near', severity: 'warn', title: 'Aproape de plafonul de TVA', detail: `Ai ajuns la ${(ytd / 100).toLocaleString('ro-RO')} lei din 300.000. Pregătește-te de înregistrarea în scopuri de TVA.`, href: '/app/setari/companie' });
      }
    }
  } catch { /* skip */ }

  const rank = { high: 0, warn: 1, info: 2 } as Record<string, number>;
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
}
