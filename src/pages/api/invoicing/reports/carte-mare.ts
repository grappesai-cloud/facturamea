// GET /api/invoicing/reports/carte-mare?from=&to=  [&format=csv]
// Cartea mare: every account with movement, opening + lines + closing.
import type { APIRoute } from 'astro';
import { collectCarteMare } from '../../../../lib/carte-mare';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const n2 = (cents: number) => ((cents || 0) / 100).toFixed(2);
const sold = (cents: number) => cents === 0 ? '0.00' : `${n2(Math.abs(cents))} ${cents > 0 ? 'D' : 'C'}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return new Response(JSON.stringify({ error: 'Perioadă invalidă' }), { status: 400 });

  try {
    const blocks = await collectCarteMare(locals.user.companyId, from, to);
    const lines = [`Cartea mare,${from} - ${to}`];
    for (const b of blocks) {
      lines.push('');
      lines.push([`${b.code} ${b.name}`, '', '', '', '', `Sold initial: ${sold(b.openingCents)}`].map(esc).join(','));
      lines.push(['Data', 'Nota', 'Explicatie', 'Debit', 'Credit', 'Sold'].map(esc).join(','));
      for (const l of b.lines) {
        lines.push([l.date, l.entry, l.description, l.debitCents ? n2(l.debitCents) : '', l.creditCents ? n2(l.creditCents) : '', sold(l.balanceCents)].map(esc).join(','));
      }
      lines.push(['', '', 'Rulaje perioada', n2(b.periodDebitCents), n2(b.periodCreditCents), sold(b.closingCents)].map(esc).join(','));
    }
    const csv = '﻿' + lines.join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Cartea_mare_${from}_${to}.csv"` } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/carte-mare', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea raportului.' }), { status: 500 });
  }
};
