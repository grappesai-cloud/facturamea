// GET /api/invoicing/reports/tva-neexigibila [&format=csv] — VAT-on-collection
// position: per invoice, total VAT vs collected (4427) vs pending (4428).
import type { APIRoute } from 'astro';
import { collectVatNeexigibila } from '../../../../lib/tva-neexigibila';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const n2 = (c: number) => ((c || 0) / 100).toFixed(2);

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  try {
    const data = await collectVatNeexigibila(locals.user.companyId);
    const lines = [
      'TVA neexigibila (TVA la incasare)',
      ['Data', 'Document', 'Client', 'Incasat %', 'TVA totala', 'Exigibila 4427', 'Neexigibila 4428'].map(esc).join(','),
    ];
    for (const it of data.items) {
      lines.push([it.date, it.doc, it.partner, String(it.paidRatioPct), n2(it.totalVatCents), n2(it.collectedVatCents), n2(it.neexigibilVatCents)].map(esc).join(','));
    }
    lines.push(['', '', '', 'TOTAL', n2(data.totalVatCents), n2(data.collectedVatCents), n2(data.neexigibilVatCents)].map(esc).join(','));
    const csv = '﻿' + lines.join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="TVA_neexigibila.csv"' } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/tva-neexigibila', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea raportului.' }), { status: 500 });
  }
};
