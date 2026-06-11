// GET /api/invoicing/reports/aging
// Returns receivables aging buckets per client: current / 30 / 60 / 90 / 90+
// Based on transport_invoices (kind=factura, status in issued/sent/partial).

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices } from '../../../../db/schema';
import { and, eq, sql } from 'drizzle-orm';

interface Row {
  clientName: string;
  clientTaxId: string | null;
  bucketCurrent: number;
  bucket30: number;
  bucket60: number;
  bucket90: number;
  bucket90plus: number;
  total: number;
  invoiceCount: number;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const cid = locals.user.companyId;
  const now = new Date();

  const open = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, cid),
    eq(transportInvoices.kind, 'factura'),
    sql`${transportInvoices.status} IN ('issued','sent','partial')`,
  ));

  const byClient = new Map<string, Row>();

  for (const inv of open) {
    const remaining = inv.totalCents - inv.paidCents;
    if (remaining <= 0) continue;
    const due = inv.dueAt ? new Date(inv.dueAt) : (inv.issuedAt ? new Date(inv.issuedAt) : now);
    const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

    const key = inv.clientTaxIdSnap || inv.clientNameSnap;
    let row = byClient.get(key);
    if (!row) {
      row = {
        clientName: inv.clientNameSnap,
        clientTaxId: inv.clientTaxIdSnap,
        bucketCurrent: 0, bucket30: 0, bucket60: 0, bucket90: 0, bucket90plus: 0,
        total: 0, invoiceCount: 0,
      };
      byClient.set(key, row);
    }
    if      (daysOverdue <= 0)  row.bucketCurrent += remaining;
    else if (daysOverdue <= 30) row.bucket30      += remaining;
    else if (daysOverdue <= 60) row.bucket60      += remaining;
    else if (daysOverdue <= 90) row.bucket90      += remaining;
    else                        row.bucket90plus  += remaining;
    row.total += remaining;
    row.invoiceCount += 1;
  }

  const rows = Array.from(byClient.values()).sort((a, b) => b.total - a.total);

  const totals = rows.reduce((acc, r) => ({
    bucketCurrent: acc.bucketCurrent + r.bucketCurrent,
    bucket30: acc.bucket30 + r.bucket30,
    bucket60: acc.bucket60 + r.bucket60,
    bucket90: acc.bucket90 + r.bucket90,
    bucket90plus: acc.bucket90plus + r.bucket90plus,
    total: acc.total + r.total,
    invoiceCount: acc.invoiceCount + r.invoiceCount,
  }), { bucketCurrent: 0, bucket30: 0, bucket60: 0, bucket90: 0, bucket90plus: 0, total: 0, invoiceCount: 0 });

  return new Response(JSON.stringify({ rows, totals }), { headers: { 'Content-Type': 'application/json' } });
};
