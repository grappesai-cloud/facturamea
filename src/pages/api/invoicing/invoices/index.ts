import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines, invoiceClients, companies, invoiceSeries, users } from '../../../../db/schema';
import { and, eq, desc, gte, ilike, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT, type InvoiceKind } from '../../../../lib/invoicing';
import { validateBody, invoiceCreateSchema } from '../../../../lib/validation';
import { captureBnrSnapshot } from '../../../../lib/bnr-fx';
import { notify } from '../../../../lib/notifications';
import { submitInvoiceToAnaf } from '../../../../lib/efactura-submit';
import { requireRole } from '../../../../lib/require-role';

const VALID_KINDS: InvoiceKind[] = ['factura', 'proforma', 'storno', 'chitanta'];

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [], total: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q')?.trim();
  const fromIso = url.searchParams.get('from');

  const conds: any[] = [eq(transportInvoices.companyId, cid)];
  if (kind && VALID_KINDS.includes(kind as InvoiceKind)) conds.push(eq(transportInvoices.kind, kind));
  if (status) conds.push(eq(transportInvoices.status, status));
  if (q) conds.push(or(
    ilike(transportInvoices.fullNumber, `%${q}%`),
    ilike(transportInvoices.clientNameSnap, `%${q}%`),
  ));
  if (fromIso) conds.push(gte(transportInvoices.issuedAt, new Date(fromIso)));

  const results = await db.select().from(transportInvoices).where(and(...conds)).orderBy(desc(transportInvoices.createdAt)).limit(100);
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

interface LineInput { description: string; quantity: number; unit?: string; unitPriceCents: number; vatRate: number; code?: string }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const v = await validateBody(request, invoiceCreateSchema);
  if (!v.ok) return v.response;
  const body = v.data as any;

  const kind = body.kind as InvoiceKind;
  if (!VALID_KINDS.includes(kind)) return new Response(JSON.stringify({ error: 'Tip document invalid' }), { status: 400 });

  // Resolve recipient — exactly one of clientCompanyId / clientExternalId.
  let clientName: string | null = body.clientName?.trim() || null;
  let clientTaxId: string | null = body.clientTaxId?.trim() || null;
  let clientAddress: string | null = body.clientAddress?.trim() || null;

  if (body.clientCompanyId) {
    const [c] = await db.select({ name: companies.name, cui: companies.cui, address: companies.address }).from(companies).where(eq(companies.id, body.clientCompanyId)).limit(1);
    if (!c) return new Response(JSON.stringify({ error: 'Client (TH) inexistent' }), { status: 400 });
    clientName = clientName || c.name;
    clientTaxId = clientTaxId || c.cui;
    clientAddress = clientAddress || c.address;
  } else if (body.clientExternalId) {
    const [c] = await db.select().from(invoiceClients).where(and(eq(invoiceClients.id, body.clientExternalId), eq(invoiceClients.ownerCompanyId, cid))).limit(1);
    if (!c) return new Response(JSON.stringify({ error: 'Client (extern) inexistent' }), { status: 400 });
    clientName = clientName || c.name;
    clientTaxId = clientTaxId || c.taxId;
    clientAddress = clientAddress || [c.address, c.city, c.county, c.country].filter(Boolean).join(', ');
  }
  if (!clientName) return new Response(JSON.stringify({ error: 'Lipsește clientul' }), { status: 400 });

  const lines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return new Response(JSON.stringify({ error: 'Cel puțin o linie de factură' }), { status: 400 });

  // Compute totals — server-side authoritative even if client sends totals.
  let subtotalCents = 0;
  let vatCents = 0;
  const computedLines = lines.map((l, idx) => {
    const q = Number(l.quantity) || 0;
    const up = Math.round(Number(l.unitPriceCents) || 0);
    const lineSub = Math.round(q * up);
    const rate = Math.max(0, Number(l.vatRate) || 0);
    const lineVat = Math.round((lineSub * rate) / 100);
    subtotalCents += lineSub;
    vatCents += lineVat;
    return {
      id: nanoid(),
      position: idx,
      code: l.code?.trim() || null,
      description: l.description?.trim() || '',
      quantity: q,
      unit: (l.unit?.trim() || 'buc'),
      unitPriceCents: up,
      vatRate: rate,
      lineTotalCents: lineSub + lineVat,
    };
  });
  const totalCents = subtotalCents + vatCents;

  // Resolve the series. If the issuer picked one explicitly (Oblio-style series
  // selector on the form), use it — but only if it belongs to this company and
  // matches the document kind. Otherwise auto-pick the default for this kind,
  // scoped platform (invoice tied to a TH order) vs external (off-platform
  // client) so two concurrent series can run in parallel.
  let series: { id: string; prefix: string } | null = null;
  if (body.seriesId) {
    const [s] = await db
      .select({ id: invoiceSeries.id, prefix: invoiceSeries.prefix })
      .from(invoiceSeries)
      .where(and(eq(invoiceSeries.id, body.seriesId), eq(invoiceSeries.companyId, cid), eq(invoiceSeries.kind, kind)))
      .limit(1);
    if (s) series = s;
  }
  const seriesScope: 'platform' | 'external' | null = body.orderId ? 'platform' : (body.clientExternalId ? 'external' : null);

  const invoiceId = nanoid();
  const now = new Date();
  const issuedAt = body.issueImmediately === false ? null : now;
  const status = issuedAt ? 'issued' : 'draft';
  const dueAt = body.dueAt ? new Date(body.dueAt) : (issuedAt ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : null);

  // BNR FX snapshot for non-RON invoices — captured at issueDate.
  const currency = (body.currency || 'RON').toUpperCase().slice(0, 5);
  const issueIso = (issuedAt || now).toISOString().slice(0, 10);
  const bnr = currency !== 'RON' ? await captureBnrSnapshot(issueIso, currency).catch(() => null) : null;

  // TVA la încasare snapshot: per-invoice override from caller, fallback to company default.
  let vatAtCollection = body.vatAtCollection === true;
  if (body.vatAtCollection === undefined) {
    const [issuerCompany] = await db.select({ tva: companies.tvaAtCollection }).from(companies).where(eq(companies.id, cid)).limit(1);
    vatAtCollection = !!issuerCompany?.tva;
  }

  // Reserve the series number and write the invoice header + lines inside a
  // single transaction. If any insert fails, the consumed number is rolled
  // back too — so a failed creation never burns a legal sequence number (gap).
  const reserved = await db.transaction(async (tx) => {
    let txSeries = series;
    if (!txSeries) {
      txSeries = await ensureDefaultSeries(cid, kind, seriesScope, tx);
    }
    const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(txSeries.id, INVOICE_NUMBER_FORMAT, tx);

    await tx.insert(transportInvoices).values({
      id: invoiceId,
      companyId: cid,
      issuedByUserId: locals.user!.id,
      seriesId: txSeries.id,
      sequenceNumber,
      fullNumber,
      kind,
      clientCompanyId: body.clientCompanyId || null,
      clientExternalId: body.clientExternalId || null,
      clientNameSnap: clientName,
      clientTaxIdSnap: clientTaxId || null,
      clientAddressSnap: clientAddress || null,
      orderId: body.orderId || null,
      parentInvoiceId: body.parentInvoiceId || null,
      modelId: body.modelId || null,
      currency,
      vatRegime: body.vatRegime || 'standard',
      subtotalCents,
      vatCents,
      totalCents,
      paidCents: 0,
      status,
      issuedAt,
      dueAt,
      bnrRate: bnr?.rate ?? null,
      bnrRateDate: bnr?.rateDate ?? null,
      vatAtCollection,
      language: body.language === 'en' ? 'en' : 'ro',
      precision: [0, 2, 3, 4].includes(Number(body.precision)) ? Number(body.precision) : 2,
      attachmentUrl: body.attachmentUrl?.trim() || null,
      attachmentName: body.attachmentName?.trim() || null,
      notes: body.notes?.trim() || null,
    });

    if (computedLines.length) {
      await tx.insert(transportInvoiceLines).values(computedLines.map((l) => ({ ...l, invoiceId })));
    }

    return { fullNumber };
  });
  const { fullNumber } = reserved;

  // In-app notification to a TH-registered recipient on issue (not for drafts).
  if (status === 'issued' && body.clientCompanyId && body.clientCompanyId !== cid) {
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://facturamea.com';
    const targets = await db.select({ id: users.id }).from(users).where(eq(users.companyId, body.clientCompanyId));
    for (const tgt of targets) {
      notify({
        userId: tgt.id,
        type: 'invoice',
        title: `Ai primit ${kind === 'proforma' ? 'o proformă' : 'o factură'}: ${fullNumber}`,
        body: `${(totalCents / 100).toFixed(2)} ${currency} de la ${locals.user.name || 'un partener'}.`,
        linkUrl: `${baseUrl}/app/facturare/${invoiceId}`,
        entityType: 'invoice',
        entityId: invoiceId,
      }).catch(() => {});
    }
  }

  // e-Factura auto-send: per-invoice `sendEfactura` flag wins; otherwise the
  // company's `efacturaAutoSend` default. Only issued facturi. Best-effort —
  // never blocks invoice creation.
  let efactura: { sent: boolean; ok?: boolean; error?: string } | undefined;
  if (kind === 'factura' && status === 'issued') {
    let sendFlag: boolean | undefined = typeof body.sendEfactura === 'boolean' ? body.sendEfactura : undefined;
    if (sendFlag === undefined) {
      const [co] = await db.select({ auto: companies.efacturaAutoSend }).from(companies).where(eq(companies.id, cid)).limit(1);
      sendFlag = !!co?.auto;
    }
    if (sendFlag) {
      try {
        const r = await submitInvoiceToAnaf(invoiceId, { userId: locals.user.id });
        efactura = { sent: true, ok: r.ok, error: r.ok ? undefined : r.error };
      } catch {
        efactura = { sent: true, ok: false, error: 'send_failed' };
      }
    }
  }

  return new Response(JSON.stringify({ id: invoiceId, fullNumber, totalCents, efactura }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
