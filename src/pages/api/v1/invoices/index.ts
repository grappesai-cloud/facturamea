import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines, invoiceClients, invoiceSeries } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiBadRequest, apiServerError, readJson, parsePaging, asString, asInt, asNumber } from '../../../../lib/api-v1';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT, type InvoiceKind } from '../../../../lib/invoicing';

const VALID_KINDS: InvoiceKind[] = ['factura', 'proforma', 'storno', 'chitanta'];

// GET /api/v1/invoices?limit=&offset=&kind=&status= — list, newest first.
export const GET: APIRoute = async ({ request, url }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();

  const { limit, offset } = parsePaging(url);
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');

  const conds: any[] = [eq(transportInvoices.companyId, auth.companyId)];
  if (kind) {
    if (!VALID_KINDS.includes(kind as InvoiceKind)) return apiBadRequest('Parametru "kind" invalid.');
    conds.push(eq(transportInvoices.kind, kind));
  }
  if (status) conds.push(eq(transportInvoices.status, status));

  try {
    const rows = await db
      .select()
      .from(transportInvoices)
      .where(and(...conds))
      .orderBy(desc(transportInvoices.createdAt))
      .limit(limit)
      .offset(offset);
    return apiJson({ data: rows, limit, offset });
  } catch {
    return apiServerError();
  }
};

interface LineInput { name?: string; description?: string; quantity?: number; unit?: string; um?: string; unitPriceCents?: number; vatRate?: number; code?: string }

// POST /api/v1/invoices — create + (by default) issue an invoice.
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const cid = auth.companyId;

  const body = await readJson(request);
  if (!body) return apiBadRequest('Corp JSON invalid.');

  const kind = (asString(body.kind) || 'factura') as InvoiceKind;
  if (!VALID_KINDS.includes(kind)) return apiBadRequest('Câmpul "kind" trebuie să fie unul dintre: factura, proforma, storno, chitanta.');

  // Lines — required.
  const rawLines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];
  if (rawLines.length === 0) return apiBadRequest('Cel puțin o linie ("lines") este obligatorie.');

  // Resolve recipient: either a clientId (existing invoiceClients row) or an
  // inline client object {name, taxId?, address?}.
  let clientName: string | null = null;
  let clientTaxId: string | null = null;
  let clientAddress: string | null = null;
  let clientExternalId: string | null = null;

  const clientId = asString(body.clientId);

  try {
    if (clientId) {
      const [c] = await db
        .select()
        .from(invoiceClients)
        .where(and(eq(invoiceClients.id, clientId), eq(invoiceClients.ownerCompanyId, cid)))
        .limit(1);
      if (!c) return apiBadRequest('Clientul ("clientId") nu există sau nu îți aparține.');
      clientExternalId = c.id;
      clientName = c.name;
      clientTaxId = c.taxId || null;
      clientAddress = [c.address, c.city, c.county, c.country].filter(Boolean).join(', ') || null;
    } else if (body.client && typeof body.client === 'object') {
      clientName = asString(body.client.name);
      clientTaxId = asString(body.client.taxId);
      clientAddress = asString(body.client.address);
      if (!clientName) return apiBadRequest('Câmpul "client.name" este obligatoriu.');
    } else {
      return apiBadRequest('Trimite fie "clientId", fie un obiect "client" cu cel puțin "name".');
    }
  } catch {
    return apiServerError();
  }

  // Validate + compute lines (server-authoritative totals, INTEGER cents).
  let subtotalCents = 0;
  let vatCents = 0;
  const computedLines: any[] = [];
  for (let idx = 0; idx < rawLines.length; idx++) {
    const l = rawLines[idx];
    const name = asString(l.name) || asString(l.description);
    if (!name) return apiBadRequest(`Linia ${idx + 1}: câmpul "name" este obligatoriu.`);
    const quantity = asNumber(l.quantity);
    if (quantity === null || quantity <= 0) return apiBadRequest(`Linia ${idx + 1}: "quantity" trebuie să fie un număr pozitiv.`);
    const unitPriceCents = asInt(l.unitPriceCents);
    if (unitPriceCents === null) return apiBadRequest(`Linia ${idx + 1}: "unitPriceCents" trebuie să fie un întreg (bani).`);
    let vatRate = asNumber(l.vatRate);
    if (vatRate === null) vatRate = 0;
    if (vatRate < 0) return apiBadRequest(`Linia ${idx + 1}: "vatRate" nu poate fi negativ.`);

    const lineSub = Math.round(quantity * unitPriceCents);
    const lineVat = Math.round((lineSub * vatRate) / 100);
    subtotalCents += lineSub;
    vatCents += lineVat;
    computedLines.push({
      id: nanoid(),
      position: idx,
      code: asString(l.code),
      description: name,
      quantity,
      unit: asString(l.unit) || asString(l.um) || 'buc',
      unitPriceCents,
      vatRate,
      lineTotalCents: lineSub + lineVat,
    });
  }
  const totalCents = subtotalCents + vatCents;

  const currency = (asString(body.currency) || 'RON').toUpperCase().slice(0, 5);

  try {
    // Resolve the series — explicit seriesId (must belong to company + match kind)
    // or the company default for this kind.
    let series: { id: string; prefix: string } | null = null;
    const seriesId = asString(body.seriesId);
    if (seriesId) {
      const [s] = await db
        .select({ id: invoiceSeries.id, prefix: invoiceSeries.prefix })
        .from(invoiceSeries)
        .where(and(eq(invoiceSeries.id, seriesId), eq(invoiceSeries.companyId, cid), eq(invoiceSeries.kind, kind)))
        .limit(1);
      if (!s) return apiBadRequest('"seriesId" invalid pentru această companie / acest tip de document.');
      series = s;
    }
    if (!series) {
      series = await ensureDefaultSeries(cid, kind, clientExternalId ? 'external' : null);
    }
    const invoiceId = nanoid();
    const now = new Date();
    const issuedAt = now;
    const dueAt = asString(body.dueDate)
      ? new Date(asString(body.dueDate)!)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const isRon = currency === 'RON';

    // Reserve the number + write header + lines in ONE transaction: a failure
    // rolls back the consumed legal number (no gap) and never leaves a lineless
    // invoice.
    let fullNumber = '';
    await db.transaction(async (tx) => {
      const r = await nextSeriesNumber(series!.id, INVOICE_NUMBER_FORMAT, tx);
      fullNumber = r.fullNumber;
      await tx.insert(transportInvoices).values({
        id: invoiceId,
        companyId: cid,
        seriesId: series!.id,
        sequenceNumber: r.number,
        fullNumber: r.fullNumber,
        kind,
        clientExternalId,
        clientNameSnap: clientName!,
        clientTaxIdSnap: clientTaxId,
        clientAddressSnap: clientAddress,
        currency,
        subtotalCents,
        vatCents,
        totalCents,
        subtotalRonCents: isRon ? subtotalCents : null,
        vatRonCents: isRon ? vatCents : null,
        totalRonCents: isRon ? totalCents : null,
        paidCents: 0,
        status: 'issued',
        issuedAt,
        dueAt,
      });
      if (computedLines.length) {
        await tx.insert(transportInvoiceLines).values(computedLines.map((l) => ({ ...l, invoiceId })));
      }
    });

    return apiJson({
      id: invoiceId,
      fullNumber,
      kind,
      status: 'issued',
      currency,
      subtotalCents,
      vatCents,
      totalCents,
      clientName,
      issuedAt: issuedAt.toISOString(),
      dueAt: dueAt.toISOString(),
      lines: computedLines.map(({ id, ...rest }) => rest),
    }, 201);
  } catch {
    return apiServerError();
  }
};
