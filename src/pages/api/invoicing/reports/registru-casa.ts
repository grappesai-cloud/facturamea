// GET /api/invoicing/reports/registru-casa?from=&to=  [&format=csv]
// Cash register (registru de casă) for the period: opening balance, every cash
// movement with running balance, closing balance.
import type { APIRoute } from 'astro';
import { collectCashRegister } from '../../../../lib/cash-register';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const n2 = (cents: number) => ((cents || 0) / 100).toFixed(2);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return new Response(JSON.stringify({ error: 'Perioadă invalidă' }), { status: 400 });

  try {
    const data = await collectCashRegister(locals.user.companyId, from, to);
    const lines = [
      `Registru de casa,${from} - ${to}`,
      ['Data', 'Document', 'Sursa', 'Explicatie', 'Incasari', 'Plati', 'Sold'].map(esc).join(','),
      ['', '', '', `Sold initial la ${from}`, '', '', n2(data.openingCents)].map(esc).join(','),
    ];
    for (const r of data.rows) {
      lines.push([r.date, r.doc, r.source, r.explanation, r.inCents ? n2(r.inCents) : '', r.outCents ? n2(r.outCents) : '', n2(r.balanceCents)].map(esc).join(','));
    }
    lines.push(['', '', '', 'TOTAL perioada', n2(data.totalsInCents), n2(data.totalsOutCents), n2(data.closingCents)].map(esc).join(','));
    const csv = '﻿' + lines.join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Registru_casa_${from}_${to}.csv"` } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/registru-casa', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea registrului.' }), { status: 500 });
  }
};
