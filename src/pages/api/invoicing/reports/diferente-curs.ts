// GET /api/invoicing/reports/diferente-curs?date=  [&format=csv]
// FX revaluation of open foreign-currency receivables + payables at the BNR rate.
import type { APIRoute } from 'astro';
import { collectFxRevaluation } from '../../../../lib/fx-revaluation';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const n2 = (cents: number) => ((cents || 0) / 100).toFixed(2);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) return new Response(JSON.stringify({ error: 'Dată invalidă' }), { status: 400 });

  try {
    const data = await collectFxRevaluation(locals.user.companyId, date);
    const lines = [
      `Diferente de curs,la ${date}`,
      ['Tip', 'Document', 'Partener', 'Valuta', 'Rest valuta', 'Curs vechi', 'Curs nou', 'Valoare veche', 'Valoare noua', 'Favorabil 765', 'Nefavorabil 665'].map(esc).join(','),
    ];
    for (const it of data.items) {
      lines.push([it.kind, it.doc, it.partner, it.currency, n2(it.remainingForeignCents), it.originalRate.toFixed(4), it.currentRate.toFixed(4), n2(it.originalRonCents), n2(it.currentRonCents), it.favorableCents ? n2(it.favorableCents) : '', it.unfavorableCents ? n2(it.unfavorableCents) : ''].map(esc).join(','));
    }
    lines.push(['', '', '', '', '', '', '', '', 'TOTAL', n2(data.totalFavorableCents), n2(data.totalUnfavorableCents)].map(esc).join(','));
    const csv = '﻿' + lines.join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Diferente_curs_${date}.csv"` } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/diferente-curs', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea raportului.' }), { status: 500 });
  }
};
