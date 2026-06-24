// GET /api/invoicing/reports/analytics?from=&to=
// Advanced analytics for the dashboard. All money is INTEGER cents.
// Returns:
//   { period, monthlyInvoiced[], monthlyCollected[], topClients[],
//     topProducts[], byStatus[], grossMargin }
// Scoped to the caller's company. Defensive: any DB failure yields empty
// buckets rather than a 500, so the dashboard renders an empty (valid) state.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines, expenses } from '../../../../db/schema';
import { and, eq, gte, lte, ne, inArray } from 'drizzle-orm';
import { invoiceRonCents } from '../../../../lib/invoicing';

interface MonthCents { month: string; cents: number; }
interface NamedCents { name: string; cents: number; }
interface StatusBucket { status: string; count: number; cents: number; }

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from: start.toISOString().slice(0, 10), to };
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const empty = {
    period: defaultRange(),
    monthlyInvoiced: [] as MonthCents[],
    monthlyCollected: [] as MonthCents[],
    topClients: [] as NamedCents[],
    topProducts: [] as NamedCents[],
    byStatus: [] as StatusBucket[],
    grossMargin: { revenueCents: 0, costCents: 0, marginCents: 0, marginPct: 0 },
  };
  if (!cid) return new Response(JSON.stringify(empty), { headers: { 'Content-Type': 'application/json' } });

  const fromQ = url.searchParams.get('from');
  const toQ = url.searchParams.get('to');
  const range = (fromQ && toQ && /^\d{4}-\d{2}-\d{2}$/.test(fromQ) && /^\d{4}-\d{2}-\d{2}$/.test(toQ))
    ? { from: fromQ, to: toQ }
    : defaultRange();
  const fromDate = new Date(range.from + 'T00:00:00Z');
  const toDate = new Date(range.to + 'T23:59:59Z');

  const monthKey = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : null);

  const monthlyInvoicedMap = new Map<string, number>();
  const monthlyCollectedMap = new Map<string, number>();
  const clientMap = new Map<string, number>();
  const statusMap = new Map<string, { count: number; cents: number }>();
  let revenueCents = 0;

  let invoices: any[] = [];
  try {
    invoices = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, cid),
      ne(transportInvoices.kind, 'proforma'),
      ne(transportInvoices.status, 'voided'),
      gte(transportInvoices.issuedAt, fromDate),
      lte(transportInvoices.issuedAt, toDate),
    ));
  } catch { /* leave empty */ }

  for (const inv of invoices) {
    if (inv.kind === 'chitanta') continue; // receipts aren't sales documents
    const mk = monthKey(inv.issuedAt ? new Date(inv.issuedAt) : (inv.createdAt ? new Date(inv.createdAt) : null));
    // All figures in RON so mixed-currency invoices don't distort the analytics.
    const ron = invoiceRonCents(inv);
    const fx = inv.currency && inv.currency !== 'RON' ? (inv.bnrRate || 1) : 1;
    const total = ron.total;
    const paid = Math.round((inv.paidCents || 0) * fx);
    if (mk) {
      monthlyInvoicedMap.set(mk, (monthlyInvoicedMap.get(mk) || 0) + total);
      monthlyCollectedMap.set(mk, (monthlyCollectedMap.get(mk) || 0) + paid);
    }
    const cname = inv.clientNameSnap || 'Client necunoscut';
    clientMap.set(cname, (clientMap.get(cname) || 0) + total);
    const st = inv.status || 'draft';
    const bucket = statusMap.get(st) || { count: 0, cents: 0 };
    bucket.count += 1; bucket.cents += total;
    statusMap.set(st, bucket);
    revenueCents += ron.subtotal;
  }

  // Top products — aggregate invoice lines for the period's invoices.
  const productMap = new Map<string, number>();
  try {
    const invoiceIds = invoices.map((i) => i.id);
    // Scope to THIS period's invoices (chunked) instead of scanning every tenant's
    // lines and filtering in JS — that was a cross-tenant full-table read.
    for (let i = 0; i < invoiceIds.length; i += 1000) {
      const chunk = invoiceIds.slice(i, i + 1000);
      const lines = await db.select({ description: transportInvoiceLines.description, lineTotalCents: transportInvoiceLines.lineTotalCents })
        .from(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, chunk));
      for (const ln of lines) {
        const key = (ln.description || 'Produs').slice(0, 80);
        productMap.set(key, (productMap.get(key) || 0) + (ln.lineTotalCents || 0));
      }
    }
  } catch { /* skip products */ }

  // Gross margin (best-effort): revenue (net sales) minus deductible expenses in range.
  let costCents = 0;
  try {
    const exp = await db.select().from(expenses).where(and(
      eq(expenses.companyId, cid),
      gte(expenses.issueDate, range.from),
      lte(expenses.issueDate, range.to),
    ));
    for (const e of exp) costCents += e.netCents || 0;
  } catch { /* skip cost */ }

  // Build a continuous month axis from `from` to `to` so the chart has no gaps.
  const months: string[] = [];
  {
    const cur = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    while (cur <= end && months.length < 60) {
      months.push(cur.toISOString().slice(0, 7));
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  }

  const monthlyInvoiced: MonthCents[] = months.map((m) => ({ month: m, cents: monthlyInvoicedMap.get(m) || 0 }));
  const monthlyCollected: MonthCents[] = months.map((m) => ({ month: m, cents: monthlyCollectedMap.get(m) || 0 }));

  const topClients: NamedCents[] = Array.from(clientMap.entries())
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  const topProducts: NamedCents[] = Array.from(productMap.entries())
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 8);

  const byStatus: StatusBucket[] = Array.from(statusMap.entries())
    .map(([status, v]) => ({ status, count: v.count, cents: v.cents }))
    .sort((a, b) => b.cents - a.cents);

  const marginCents = revenueCents - costCents;
  const marginPct = revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : 0;

  return new Response(JSON.stringify({
    period: range,
    monthlyInvoiced,
    monthlyCollected,
    topClients,
    topProducts,
    byStatus,
    grossMargin: { revenueCents, costCents, marginCents, marginPct },
  }), { headers: { 'Content-Type': 'application/json' } });
};
