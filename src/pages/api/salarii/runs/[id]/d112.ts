// Summary D112 export (sumar D112) — CSV with one row per employee plus a totals
// row. NOT the full ANAF D112 XML (that's a later step); this is a working summary
// the accountant can reconcile against.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { payrollRuns, payrollItems } from '../../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { MONTHS_RO } from '../../../../../lib/payroll';

const lei = (cents: number) => ((cents || 0) / 100).toFixed(2);

// Minimal CSV-cell escaping (quote when the value contains ; " or newline).
function cell(v: any): string {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const row = (cells: any[]) => cells.map(cell).join(';');

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id || '';

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid))).limit(1);
  if (!run) return new Response(JSON.stringify({ error: 'Stat de plată inexistent' }), { status: 404 });

  const items = await db.select().from(payrollItems)
    .where(eq(payrollItems.runId, id)).orderBy(asc(payrollItems.employeeNameSnap));

  const lines: string[] = [];
  lines.push(row(['Angajat', 'CNP', 'Brut', 'CAS 25%', 'CASS 10%', 'Impozit 10%', 'Net', 'CAM angajator 2.25%']));
  for (const it of items as any[]) {
    lines.push(row([
      it.employeeNameSnap || '',
      '', // CNP is not snapshotted on the item; left blank in the summary.
      lei(it.grossCents), lei(it.casCents), lei(it.cassCents), lei(it.taxCents), lei(it.netCents), lei(it.camCents),
    ]));
  }
  lines.push(row([
    'TOTAL', '',
    lei(run.totalGrossCents), lei(run.totalCasCents), lei(run.totalCassCents),
    lei(run.totalTaxCents), lei(run.totalNetCents), lei(run.totalCamCents),
  ]));

  // Prepend a UTF-8 BOM so Excel opens the diacritics correctly.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const fname = `D112-sumar-${run.year}-${String(run.month).padStart(2, '0')}.csv`;
  const period = `${MONTHS_RO[(run.month || 1) - 1]} ${run.year}`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'X-Payroll-Period': period,
    },
  });
};
