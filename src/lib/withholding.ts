// Rețineri la sursă → D205 (declarația informativă). Self-provisions its table.
// D205 reports, per income beneficiary, the gross income paid and tax withheld.
import { db, withholdingEntries } from '../db';
import { sql, eq, and, desc } from 'drizzle-orm';

export async function ensureWithholdingTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS withholding_entries (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    year integer NOT NULL,
    paid_date date,
    beneficiary_name varchar(200) NOT NULL,
    beneficiary_cnp varchar(20),
    income_type varchar(40) DEFAULT 'dividende',
    gross_cents integer NOT NULL,
    tax_pct double precision DEFAULT 8,
    tax_cents integer NOT NULL DEFAULT 0,
    net_cents integer NOT NULL DEFAULT 0,
    notes text,
    created_at timestamp DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_withholding_company ON withholding_entries (company_id)`);
}

export async function listWithholdings(companyId: string, year?: number) {
  await ensureWithholdingTable();
  const where = [eq(withholdingEntries.companyId, companyId)];
  if (year) where.push(eq(withholdingEntries.year, year));
  return db.select().from(withholdingEntries).where(and(...where)).orderBy(desc(withholdingEntries.paidDate));
}

const INCOME_LABEL: Record<string, string> = {
  dividende: 'Dividende', chirii: 'Chirii', drepturi_autor: 'Drepturi de autor', alte: 'Alte venituri',
};

// D205 CSV — one row per (beneficiary, income type) with totals.
export function generateD205Csv(rows: Array<{ beneficiaryName: string; beneficiaryCnp: string | null; incomeType: string | null; grossCents: number; taxCents: number; netCents: number }>, year: number): string {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n2 = (c: number) => ((c || 0) / 100).toFixed(2);
  const map = new Map<string, { name: string; cnp: string; type: string; gross: number; tax: number; net: number }>();
  for (const r of rows) {
    const type = r.incomeType || 'alte';
    const key = `${r.beneficiaryCnp || r.beneficiaryName}|${type}`;
    const g = map.get(key) || { name: r.beneficiaryName, cnp: r.beneficiaryCnp || '', type, gross: 0, tax: 0, net: 0 };
    g.gross += r.grossCents || 0; g.tax += r.taxCents || 0; g.net += r.netCents || 0;
    map.set(key, g);
  }
  const lines = [`D205,An ${year}`, ['Beneficiar', 'CNP', 'Tip venit', 'Venit brut', 'Impozit retinut', 'Venit net'].map(esc).join(',')];
  let tg = 0; let tt = 0;
  for (const g of map.values()) {
    lines.push([g.name, g.cnp, INCOME_LABEL[g.type] || g.type, n2(g.gross), n2(g.tax), n2(g.net)].map(esc).join(','));
    tg += g.gross; tt += g.tax;
  }
  lines.push(['TOTAL', '', '', n2(tg), n2(tt), n2(tg - tt)].map(esc).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
