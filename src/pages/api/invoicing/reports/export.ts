// CSV export for invoicing reports. Same filters as the rapoarte page.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoicePayments } from '../../../../db/schema';
import { and, eq, gte, lte, ilike, sql, desc } from 'drizzle-orm';

function csv(rows: any[], header: string[]): string {
  const escapeCell = (v: any) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map((h) => escapeCell(r[h])).join(','));
  return lines.join('\n');
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response('unauthorized', { status: 401 });
  const cid = locals.user.companyId;
  const tab = url.searchParams.get('tab') || 'facturi';
  const q = url.searchParams.get('q')?.trim() || '';
  const clientFilter = url.searchParams.get('client')?.trim() || '';
  const seriesId = url.searchParams.get('series') || '';
  const statusFilter = url.searchParams.get('status') || 'toate';
  const fromIso = url.searchParams.get('from') || '';
  const toIso = url.searchParams.get('to') || '';

  const fmtAmount = (cents: number) => (cents / 100).toFixed(2);
  let csvText = '';
  let filename = `report-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;

  if (tab === 'facturi' || tab === 'proforma') {
    const kindForTab = statusFilter === 'storno' ? 'storno' : (tab === 'proforma' ? 'proforma' : 'factura');
    const conds: any[] = [eq(transportInvoices.companyId, cid), eq(transportInvoices.kind, kindForTab)];
    if (q) conds.push(ilike(transportInvoices.fullNumber, `%${q}%`));
    if (clientFilter) conds.push(ilike(transportInvoices.clientNameSnap, `%${clientFilter}%`));
    if (seriesId) conds.push(eq(transportInvoices.seriesId, seriesId));
    if (fromIso) conds.push(gte(transportInvoices.issuedAt, new Date(fromIso)));
    if (toIso) conds.push(lte(transportInvoices.issuedAt, new Date(toIso + 'T23:59:59')));
    const nowDate = new Date();
    switch (statusFilter) {
      case 'nefinalizata': conds.push(eq(transportInvoices.status, 'draft')); break;
      case 'anulata': conds.push(eq(transportInvoices.status, 'voided')); break;
      case 'termen_depasit': conds.push(sql`${transportInvoices.status} IN ('issued','sent','partial')`); conds.push(lte(transportInvoices.dueAt, nowDate)); break;
      case 'incasata': conds.push(eq(transportInvoices.status, 'paid')); break;
      case 'incasata_partial': conds.push(eq(transportInvoices.status, 'partial')); break;
      case 'neincasata': conds.push(sql`${transportInvoices.status} IN ('issued','sent')`); break;
      case 'netrimise': conds.push(sql`${transportInvoices.efacturaStatus} IS NULL`); break;
      case 'cu_erori': conds.push(sql`(${transportInvoices.efacturaStatus} = 'rejected' OR ${transportInvoices.efacturaError} IS NOT NULL)`); break;
    }
    const rows = await db.select().from(transportInvoices).where(and(...conds)).orderBy(desc(transportInvoices.issuedAt)).limit(5000);
    csvText = csv(rows.map((r) => ({
      number: r.fullNumber, client: r.clientNameSnap, taxId: r.clientTaxIdSnap || '',
      issuedAt: r.issuedAt ? new Date(r.issuedAt).toISOString().slice(0, 10) : '',
      dueAt: r.dueAt ? new Date(r.dueAt).toISOString().slice(0, 10) : '',
      currency: r.currency,
      subtotal: fmtAmount(r.subtotalCents), vat: fmtAmount(r.vatCents),
      total: fmtAmount(r.totalCents), paid: fmtAmount(r.paidCents),
      status: r.status,
    })), ['number', 'client', 'taxId', 'issuedAt', 'dueAt', 'currency', 'subtotal', 'vat', 'total', 'paid', 'status']);
  } else if (tab === 'incasari') {
    const conds: any[] = [];
    if (fromIso) conds.push(gte(transportInvoicePayments.receivedAt, new Date(fromIso)));
    if (toIso) conds.push(lte(transportInvoicePayments.receivedAt, new Date(toIso + 'T23:59:59')));
    const rows = await db.select({
      receivedAt: transportInvoicePayments.receivedAt,
      fullNumber: transportInvoices.fullNumber,
      clientName: transportInvoices.clientNameSnap,
      method: transportInvoicePayments.method,
      reference: transportInvoicePayments.reference,
      amountCents: transportInvoicePayments.amountCents,
      currency: transportInvoicePayments.currency,
    })
      .from(transportInvoicePayments)
      .innerJoin(transportInvoices, eq(transportInvoices.id, transportInvoicePayments.invoiceId))
      .where(and(eq(transportInvoices.companyId, cid), ...conds))
      .orderBy(desc(transportInvoicePayments.receivedAt))
      .limit(5000);
    csvText = csv(rows.map((r) => ({
      date: new Date(r.receivedAt).toISOString().slice(0, 10),
      invoice: r.fullNumber, client: r.clientName,
      method: r.method || '', reference: r.reference || '',
      amount: fmtAmount(r.amountCents), currency: r.currency,
    })), ['date', 'invoice', 'client', 'method', 'reference', 'amount', 'currency']);
  } else if (tab === 'spv') {
    const rows = await db.select().from(transportInvoices).where(and(
      eq(transportInvoices.companyId, cid),
      sql`${transportInvoices.efacturaStatus} IS NOT NULL`,
    )).orderBy(desc(transportInvoices.efacturaSubmittedAt)).limit(5000);
    csvText = csv(rows.map((r) => ({
      number: r.fullNumber,
      spvIndex: r.efacturaAnafId || '',
      status: r.efacturaStatus || '',
      submittedAt: r.efacturaSubmittedAt ? new Date(r.efacturaSubmittedAt).toISOString() : '',
      error: r.efacturaError || '',
    })), ['number', 'spvIndex', 'status', 'submittedAt', 'error']);
  } else {
    return new Response('bad tab', { status: 400 });
  }

  return new Response(csvText, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
