// GET /api/invoicing/reports/jurnal-tva?month=&year=  (or ?from=&to=) [&format=csv]
// VAT sales + purchase journals for the period. CSV (default) is the printable
// register; the page renders the same data on screen.
import type { APIRoute } from 'astro';
import { resolvePeriod } from '../../../../lib/declaratii';
import { collectVatJournal, type VatJournalSide } from '../../../../lib/vat-journal';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const n2 = (cents: number) => ((cents || 0) / 100).toFixed(2);

function sideCsv(title: string, side: VatJournalSide, rates: string[]): string {
  const head = ['Nr', 'Data', 'Document', 'Partener', 'CUI'];
  for (const r of rates) { head.push(`Baza ${r}%`, `TVA ${r}%`); }
  head.push('Total baza', 'Total TVA', 'Total', 'Mentiuni');
  const lines = [title, head.map(esc).join(',')];
  side.rows.forEach((row, i) => {
    const cols: (string | number)[] = [i + 1, row.date, row.doc, row.partner, row.cui];
    for (const r of rates) { cols.push(row.byRate[r] ? n2(row.byRate[r].base) : '', row.byRate[r] ? n2(row.byRate[r].vat) : ''); }
    cols.push(n2(row.baseCents), n2(row.vatCents), n2(row.totalCents), row.note || '');
    lines.push(cols.map(esc).join(','));
  });
  const tot: (string | number)[] = ['', '', '', '', 'TOTAL'];
  for (const r of rates) { tot.push(side.totals.byRate[r] ? n2(side.totals.byRate[r].base) : '', side.totals.byRate[r] ? n2(side.totals.byRate[r].vat) : ''); }
  tot.push(n2(side.totals.baseCents), n2(side.totals.vatCents), n2(side.totals.totalCents), '');
  lines.push(tot.map(esc).join(','));
  return lines.join('\r\n');
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const period = resolvePeriod(url.searchParams);
  if (!period) return new Response(JSON.stringify({ error: 'Perioadă invalidă' }), { status: 400 });

  try {
    const data = await collectVatJournal(locals.user.companyId, period);
    const csv = '﻿' + [
      sideCsv('JURNAL DE VANZARI', data.sales, data.rates),
      '',
      sideCsv('JURNAL DE CUMPARARI', data.purchases, data.rates),
    ].join('\r\n') + '\r\n';
    const filename = `Jurnal_TVA_${period.year}_${String(period.month).padStart(2, '0')}.csv`;
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
    });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/jurnal-tva', method: 'GET', extra: { period } });
    return new Response(JSON.stringify({ error: 'Eroare la generarea jurnalului.' }), { status: 500 });
  }
};
