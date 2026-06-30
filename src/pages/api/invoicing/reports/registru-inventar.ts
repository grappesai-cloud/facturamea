// GET /api/invoicing/reports/registru-inventar [&format=csv]
// Registru-inventar: current stock snapshot per warehouse, quantity + value.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { stockLevels, invoiceProducts, warehouses } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { captureError } from '../../../../lib/observability';

const esc = (v: string | number) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const n2 = (cents: number) => ((cents || 0) / 100).toFixed(2);

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const asOf = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  try {
    const rows = await db.select({
      wh: warehouses.name, code: invoiceProducts.code, name: invoiceProducts.name,
      um: invoiceProducts.defaultUm, ptype: invoiceProducts.productType,
      quantity: stockLevels.quantity, avgCostCents: stockLevels.avgCostCents,
    }).from(stockLevels)
      .leftJoin(invoiceProducts, eq(stockLevels.productId, invoiceProducts.id))
      .leftJoin(warehouses, eq(stockLevels.warehouseId, warehouses.id))
      .where(eq(stockLevels.companyId, locals.user.companyId));

    const lines = [`Registru inventar,la ${asOf}`, ['Depozit', 'Cod', 'Denumire', 'Tip', 'UM', 'Cantitate', 'Valoare unitara', 'Valoare'].map(esc).join(',')];
    let total = 0;
    for (const r of rows) {
      const q = Number(r.quantity) || 0;
      if (q === 0) continue;
      const value = Math.round(q * (Number(r.avgCostCents) || 0));
      total += value;
      lines.push([r.wh || 'Depozit principal', r.code || '', r.name || '', r.ptype || '', r.um || 'buc', String(q), n2(r.avgCostCents || 0), n2(value)].map(esc).join(','));
    }
    lines.push(['', '', '', '', '', '', 'TOTAL', n2(total)].map(esc).join(','));
    const csv = '﻿' + lines.join('\r\n') + '\r\n';
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="Registru_inventar_${asOf}.csv"` } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/registru-inventar', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea registrului.' }), { status: 500 });
  }
};
