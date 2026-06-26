import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines, invoiceClients, companies, invoiceSeries, users, warehouses, stockLevels } from '../../../../db/schema';
import { and, eq, desc, gte, ilike, or, inArray } from 'drizzle-orm';
import { applyStockOut } from '../../../../lib/stock';
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

interface LineInput { description: string; quantity: number; unit?: string; unitPriceCents: number; vatRate: number; code?: string; productId?: string }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  // A non-VAT-payer issuer (per ANAF) may NOT charge VAT — force 0 on all lines
  // regardless of what the form sent.
  const [issuerCo] = await db.select({ isVatPayer: companies.isVatPayer }).from(companies).where(eq(companies.id, cid)).limit(1);
  const forceNoVat = (issuerCo as any)?.isVatPayer === false;

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
    const rate = forceNoVat ? 0 : Math.max(0, Number(l.vatRate) || 0);
    const lineVat = Math.round((lineSub * rate) / 100);
    subtotalCents += lineSub;
    vatCents += lineVat;
    return {
      id: nanoid(),
      position: idx,
      productId: (l.productId && String(l.productId)) || null,
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

  // A non-RON invoice cannot be issued without a BNR rate: every declaration
  // (D300/D394/D390/SAF-T) and the ledger report in RON, so we freeze the RON
  // value here. No rate → refuse rather than misstate VAT to ANAF.
  if (currency !== 'RON' && !(bnr && (bnr.rate as number) > 0)) {
    return new Response(JSON.stringify({ error: `Nu am putut obține cursul BNR ${currency}/RON pentru ${issueIso}. Reîncearcă sau emite factura în RON.` }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  }
  const fxRate = currency === 'RON' ? 1 : (bnr!.rate as number);
  const subtotalRonCents = Math.round(subtotalCents * fxRate);
  const vatRonCents = Math.round(vatCents * fxRate);
  const totalRonCents = Math.round(totalCents * fxRate);

  // TVA la încasare snapshot: per-invoice override from caller, fallback to company default.
  let vatAtCollection = body.vatAtCollection === true;
  if (body.vatAtCollection === undefined) {
    const [issuerCompany] = await db.select({ tva: companies.tvaAtCollection }).from(companies).where(eq(companies.id, cid)).limit(1);
    vatAtCollection = !!issuerCompany?.tva;
  }

  // Stock-out preparation: an issued *factura* with stocked products draws them
  // down from the default warehouse. We pre-resolve the warehouse + which line
  // products are actually stocked (have a level) so services don't create stock.
  const stockableLineProducts = computedLines.filter((l) => l.productId).map((l) => l.productId as string);
  let stockWarehouseId: string | null = null;
  const stockedSet = new Set<string>();
  if (kind === 'factura' && status === 'issued' && stockableLineProducts.length) {
    const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
      .where(eq(warehouses.companyId, cid)).orderBy(desc(warehouses.isDefault)).limit(1);
    if (wh) {
      stockWarehouseId = wh.id;
      const levels = await db.select({ productId: stockLevels.productId }).from(stockLevels)
        .where(and(eq(stockLevels.companyId, cid), eq(stockLevels.warehouseId, wh.id), inArray(stockLevels.productId, stockableLineProducts)));
      for (const lv of levels) stockedSet.add(lv.productId);
    }
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
      subtotalRonCents,
      vatRonCents,
      totalRonCents,
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

    // Draw stocked products down from the default warehouse (same tx → level +
    // movement + invoice stay consistent; storno reverses this on reversal).
    if (stockWarehouseId) {
      for (const l of computedLines) {
        if (l.productId && stockedSet.has(l.productId) && l.quantity > 0) {
          // null cost → applyStockOut records the product's current avg cost (COGS),
          // not the selling price, so a later storno reversal can't inflate avg cost.
          await applyStockOut(cid, stockWarehouseId, l.productId, l.quantity, null, { reason: `Factură ${fullNumber}`, refType: 'invoice', refId: invoiceId, userId: locals.user!.id }, tx);
        }
      }
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

  // Non-blocking: warn the owner once if a non-VAT-payer just crossed the plafon.
  if (kind === 'factura') {
    try { const { checkVatThreshold } = await import('../../../../lib/vat-threshold'); await checkVatThreshold(cid); } catch (e) { console.error('vat threshold check failed', e); }
  }

  return new Response(JSON.stringify({ id: invoiceId, fullNumber, totalCents, efactura }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
