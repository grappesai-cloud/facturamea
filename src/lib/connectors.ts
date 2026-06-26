// E-commerce connector helpers: map WooCommerce / Shopify orders into our
// internal invoice shape and persist them via the shared invoicing series
// allocator. All DB access is wrapped in try/catch by the caller (webhooks);
// the mapping functions are pure and never touch the DB.
import { db } from '../db';
import { transportInvoices, transportInvoiceLines } from '../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT } from './invoicing';

import crypto from 'node:crypto';

// Constant-time verification of a base64 HMAC-SHA256 signature over the RAW
// request body. Shopify (`X-Shopify-Hmac-Sha256`) and WooCommerce
// (`X-WC-Webhook-Signature`) both send base64(HMAC-SHA256(rawBody, secret)).
//
// We key the HMAC with the per-connection `webhookSecret` (the only secret the
// integration_connections schema stores). The store must be configured to sign
// with that same value. If a dedicated app-secret column is added later, use it.
export function verifyHmacBase64(rawBody: string, secret: string, providedHeader: string | null | undefined): boolean {
  if (!secret || !providedHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(providedHeader));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface MappedLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
}

export interface MappedOrder {
  clientName: string;
  clientTaxId?: string | null;
  currency: string;
  lines: MappedLine[];
  externalOrderRef?: string | null; // e.g. WooCommerce "123" / Shopify name "#1001"
}

// Default Romanian standard VAT rate when the order payload doesn't carry a
// per-line tax breakdown.
const DEFAULT_VAT_RATE = 21;

function toCentsFromDecimalString(v: unknown): number {
  // Woo sends amounts as decimal strings ("19.99"). Round to integer cents.
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toCentsFromMajor(v: unknown): number {
  // Shopify sends amounts as major-unit strings/numbers ("19.99").
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// ── WooCommerce order → invoice ─────────────────────────────────────────────
// Woo "order.created" webhook payload (REST shape). We read billing for the
// client identity and line_items for the goods. Woo line prices are decimal
// strings; `price` is the per-unit price excl. tax in the store currency.
export function mapWooOrderToInvoice(order: any): MappedOrder {
  const billing = order?.billing || {};
  const company = (billing.company || '').trim();
  const person = [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim();
  const clientName = company || person || 'Client magazin online';

  // Woo doesn't expose a CUI by default; some stores stash it in a meta field.
  const meta: any[] = Array.isArray(order?.meta_data) ? order.meta_data : [];
  const taxMeta = meta.find((m) => /cui|vat|cif|tax/i.test(String(m?.key || '')));
  const clientTaxId = (taxMeta?.value && String(taxMeta.value).trim()) || null;

  const currency = String(order?.currency || 'RON').toUpperCase().slice(0, 5);

  const items: any[] = Array.isArray(order?.line_items) ? order.line_items : [];
  const lines: MappedLine[] = items.map((it) => {
    const quantity = Math.max(0, Number(it?.quantity) || 1);
    // Prefer explicit per-unit `price`; fall back to subtotal / qty.
    let unitPriceCents = toCentsFromDecimalString(it?.price);
    if (!unitPriceCents) {
      const sub = toCentsFromDecimalString(it?.subtotal);
      unitPriceCents = quantity > 0 ? Math.round(sub / quantity) : sub;
    }
    // Derive VAT rate from total_tax / subtotal when available.
    const subtotal = toCentsFromDecimalString(it?.subtotal);
    const totalTax = toCentsFromDecimalString(it?.subtotal_tax ?? it?.total_tax);
    let vatRate = DEFAULT_VAT_RATE;
    if (subtotal > 0 && totalTax >= 0) {
      const derived = Math.round((totalTax / subtotal) * 100);
      if (derived > 0 && derived <= 30) vatRate = derived;
    }
    return {
      description: String(it?.name || 'Produs').slice(0, 500),
      quantity,
      unitPriceCents,
      vatRate,
    };
  });

  // Optional shipping line.
  const shippingTotal = toCentsFromDecimalString(order?.shipping_total);
  if (shippingTotal > 0) {
    lines.push({ description: 'Transport', quantity: 1, unitPriceCents: shippingTotal, vatRate: DEFAULT_VAT_RATE });
  }

  if (lines.length === 0) {
    const total = toCentsFromDecimalString(order?.total);
    lines.push({ description: 'Comandă magazin online', quantity: 1, unitPriceCents: total, vatRate: DEFAULT_VAT_RATE });
  }

  return {
    clientName,
    clientTaxId,
    currency,
    lines,
    externalOrderRef: order?.number ? String(order.number) : (order?.id != null ? String(order.id) : null),
  };
}

// ── Shopify order → invoice ─────────────────────────────────────────────────
// Shopify "Order creation" webhook payload. Amounts are in major units
// (strings). Client identity from `customer` / `billing_address`.
export function mapShopifyOrderToInvoice(order: any): MappedOrder {
  const cust = order?.customer || {};
  const billing = order?.billing_address || {};
  const company = (billing.company || cust.default_address?.company || '').trim();
  const person = [cust.first_name, cust.last_name].filter(Boolean).join(' ').trim()
    || [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim();
  const clientName = company || person || 'Client magazin online';

  // Shopify may carry a tax id in note_attributes.
  const attrs: any[] = Array.isArray(order?.note_attributes) ? order.note_attributes : [];
  const taxAttr = attrs.find((a) => /cui|vat|cif|tax/i.test(String(a?.name || '')));
  const clientTaxId = (taxAttr?.value && String(taxAttr.value).trim()) || null;

  const currency = String(order?.currency || 'RON').toUpperCase().slice(0, 5);

  const items: any[] = Array.isArray(order?.line_items) ? order.line_items : [];
  const lines: MappedLine[] = items.map((it) => {
    const quantity = Math.max(0, Number(it?.quantity) || 1);
    const unitPriceCents = toCentsFromMajor(it?.price);
    // Shopify gives a tax_lines array per item; derive rate from the first.
    let vatRate = DEFAULT_VAT_RATE;
    const taxLines: any[] = Array.isArray(it?.tax_lines) ? it.tax_lines : [];
    if (taxLines.length && Number.isFinite(Number(taxLines[0]?.rate))) {
      const r = Math.round(Number(taxLines[0].rate) * 100);
      if (r > 0 && r <= 30) vatRate = r;
    }
    return {
      description: String(it?.title || it?.name || 'Produs').slice(0, 500),
      quantity,
      unitPriceCents,
      vatRate,
    };
  });

  // Shipping line(s).
  const shipLines: any[] = Array.isArray(order?.shipping_lines) ? order.shipping_lines : [];
  for (const s of shipLines) {
    const cents = toCentsFromMajor(s?.price);
    if (cents > 0) lines.push({ description: String(s?.title || 'Transport').slice(0, 500), quantity: 1, unitPriceCents: cents, vatRate: DEFAULT_VAT_RATE });
  }

  if (lines.length === 0) {
    const total = toCentsFromMajor(order?.total_price);
    lines.push({ description: 'Comandă magazin online', quantity: 1, unitPriceCents: total, vatRate: DEFAULT_VAT_RATE });
  }

  return {
    clientName,
    clientTaxId,
    currency,
    lines,
    externalOrderRef: order?.name ? String(order.name) : (order?.order_number != null ? String(order.order_number) : null),
  };
}

// ── eMag Marketplace order → invoice ────────────────────────────────────────
// eMag `order/read` result item. Unlike Woo/Shopify, eMag is PULL-based (no
// webhook): a poller fetches finalized orders and feeds them here. Amounts come
// as decimal strings; `sale_price` is the per-unit price WITHOUT VAT, in RON.
// Client identity: `customer.legal_entity === 1` ⇒ company (CUI in `customer.code`),
// otherwise a natural person (no tax id).
export function mapEmagOrderToInvoice(order: any): MappedOrder {
  const cust = order?.customer || {};
  const isCompany = String(cust.legal_entity ?? '0') === '1' || !!String(cust.company || '').trim();
  const company = String(cust.company || '').trim();
  const person = String(cust.name || cust.billing_name || '').trim();
  const clientName = (isCompany ? (company || person) : (person || company)) || 'Client eMag';
  // For companies eMag puts the CUI in `code`; persoane fizice have none.
  const clientTaxId = isCompany ? (String(cust.code || '').trim() || null) : null;

  // eMag.ro invoices in RON. Other platforms (.bg/.hu) carry their own currency.
  const currency = String(order?.currency || 'RON').toUpperCase().slice(0, 5);

  const items: any[] = Array.isArray(order?.products) ? order.products : [];
  const lines: MappedLine[] = items.map((it) => {
    const quantity = Math.max(0, Number(it?.quantity) || 1);
    const unitPriceCents = toCentsFromDecimalString(it?.sale_price);
    // eMag may carry the VAT as a decimal ("0.21") or a percentage ("21");
    // normalise to an integer percent, falling back to the RO standard rate.
    let vatRate = DEFAULT_VAT_RATE;
    const rawVat = it?.vat;
    if (rawVat != null && String(rawVat).trim() !== '') {
      const v = parseFloat(String(rawVat).replace(',', '.'));
      if (Number.isFinite(v)) {
        const pct = v > 0 && v <= 1 ? Math.round(v * 100) : Math.round(v);
        if (pct >= 0 && pct <= 30) vatRate = pct;
      }
    }
    return {
      description: String(it?.name || 'Produs').slice(0, 500),
      quantity,
      unitPriceCents,
      vatRate,
    };
  });

  // Shipping is billed via `shipping_tax` (the delivery amount charged).
  const shipping = toCentsFromDecimalString(order?.shipping_tax);
  if (shipping > 0) {
    lines.push({ description: 'Transport', quantity: 1, unitPriceCents: shipping, vatRate: DEFAULT_VAT_RATE });
  }

  if (lines.length === 0) {
    lines.push({ description: 'Comandă eMag', quantity: 1, unitPriceCents: 0, vatRate: DEFAULT_VAT_RATE });
  }

  return {
    clientName,
    clientTaxId,
    currency,
    lines,
    externalOrderRef: order?.id != null ? String(order.id) : null,
  };
}

// ── PrestaShop order → invoice ──────────────────────────────────────────────
// PrestaShop (via a webhook module) posts an order object. Field names vary by
// module/version, so we read tolerantly with fallbacks. Prices are decimal
// strings; we prefer the tax-excluded unit price and derive the rate.
export function mapPrestaShopOrderToInvoice(order: any): MappedOrder {
  const cust = order?.customer || {};
  const addr = order?.invoice_address || order?.address_invoice || {};
  const company = String(cust.company || addr.company || '').trim();
  const person = [cust.firstname || addr.firstname, cust.lastname || addr.lastname].filter(Boolean).join(' ').trim();
  const clientName = company || person || 'Client magazin online';
  const clientTaxId = String(addr.vat_number || cust.vat_number || cust.siret || '').trim() || null;

  const currency = String(order?.currency || order?.id_currency_iso || 'RON').toUpperCase().slice(0, 5);

  const items: any[] = Array.isArray(order?.products) ? order.products
    : Array.isArray(order?.order_rows) ? order.order_rows : [];
  const lines: MappedLine[] = items.map((it) => {
    const quantity = Math.max(0, Number(it?.product_quantity ?? it?.quantity) || 1);
    const unitPriceCents = toCentsFromDecimalString(it?.unit_price_tax_excl ?? it?.product_price ?? it?.unit_price);
    let vatRate = DEFAULT_VAT_RATE;
    const t = parseFloat(String(it?.tax_rate ?? '').replace(',', '.'));
    if (Number.isFinite(t) && t > 0 && t <= 30) vatRate = Math.round(t);
    return { description: String(it?.product_name ?? it?.name ?? 'Produs').slice(0, 500), quantity, unitPriceCents, vatRate };
  });

  const ship = toCentsFromDecimalString(order?.total_shipping_tax_excl ?? order?.total_shipping);
  if (ship > 0) lines.push({ description: 'Transport', quantity: 1, unitPriceCents: ship, vatRate: DEFAULT_VAT_RATE });

  if (lines.length === 0) {
    const total = toCentsFromDecimalString(order?.total_paid_tax_excl ?? order?.total_paid);
    lines.push({ description: 'Comandă magazin online', quantity: 1, unitPriceCents: total, vatRate: DEFAULT_VAT_RATE });
  }

  return {
    clientName,
    clientTaxId,
    currency,
    lines,
    externalOrderRef: order?.id_order != null ? String(order.id_order) : (order?.id != null ? String(order.id) : null),
  };
}

// ── Gomag order → invoice ───────────────────────────────────────────────────
// Gomag (RO shop platform) order webhook. Billing carries the client identity
// (incl. `cui` for companies); products carry unit price + VAT.
export function mapGomagOrderToInvoice(order: any): MappedOrder {
  const b = order?.billing || order?.customer || {};
  const company = String(b.company || b.firma || '').trim();
  const person = String(b.name || b.nume || [b.firstname, b.lastname].filter(Boolean).join(' ')).trim();
  const clientName = company || person || 'Client magazin online';
  const clientTaxId = String(b.cui || b.cif || b.vat || '').trim() || null;

  const currency = String(order?.currency || 'RON').toUpperCase().slice(0, 5);

  const items: any[] = Array.isArray(order?.products) ? order.products
    : Array.isArray(order?.items) ? order.items : [];
  const lines: MappedLine[] = items.map((it) => {
    const quantity = Math.max(0, Number(it?.quantity ?? it?.qty) || 1);
    const unitPriceCents = toCentsFromDecimalString(it?.price ?? it?.unit_price ?? it?.pret);
    let vatRate = DEFAULT_VAT_RATE;
    const v = parseFloat(String(it?.vat ?? it?.tva ?? '').replace(',', '.'));
    if (Number.isFinite(v)) {
      const pct = v > 0 && v <= 1 ? Math.round(v * 100) : Math.round(v);
      if (pct >= 0 && pct <= 30) vatRate = pct;
    }
    return { description: String(it?.name ?? it?.product_name ?? 'Produs').slice(0, 500), quantity, unitPriceCents, vatRate };
  });

  const ship = toCentsFromDecimalString(order?.shipping ?? order?.transport);
  if (ship > 0) lines.push({ description: 'Transport', quantity: 1, unitPriceCents: ship, vatRate: DEFAULT_VAT_RATE });

  if (lines.length === 0) lines.push({ description: 'Comandă magazin online', quantity: 1, unitPriceCents: 0, vatRate: DEFAULT_VAT_RATE });

  return {
    clientName,
    clientTaxId,
    currency,
    lines,
    externalOrderRef: order?.order_id != null ? String(order.order_id) : (order?.id != null ? String(order.id) : null),
  };
}

// ── Stripe payment event → invoice ──────────────────────────────────────────
// "Stripe as a source": when the client's own Stripe account collects a payment,
// issue an invoice for it. Stripe amounts are ALREADY in minor units (bani), so
// no ×100. We split net/VAT from `total_details.amount_tax` when present, else
// assume the amount is gross at the RO standard rate. Returns null for events we
// don't invoice (unpaid sessions, unknown types).
export function mapStripeEventToInvoice(event: any): MappedOrder | null {
  const obj = event?.data?.object || {};
  const type = String(event?.type || '');
  let amountTotal = 0;
  let amountTax = 0;
  let currency = 'RON';
  let name = '';
  let ref = '';

  if (type === 'checkout.session.completed') {
    if (obj.payment_status && obj.payment_status !== 'paid') return null;
    amountTotal = Number(obj.amount_total) || 0;
    amountTax = Number(obj.total_details?.amount_tax) || 0;
    currency = String(obj.currency || 'ron').toUpperCase().slice(0, 5);
    name = obj.customer_details?.name || obj.customer_details?.email || '';
    ref = String(obj.id || '');
  } else if (type === 'payment_intent.succeeded') {
    amountTotal = Number(obj.amount_received ?? obj.amount) || 0;
    currency = String(obj.currency || 'ron').toUpperCase().slice(0, 5);
    name = obj.shipping?.name || obj.receipt_email || '';
    ref = String(obj.id || '');
  } else {
    return null;
  }
  if (amountTotal <= 0) return null;

  let net: number;
  let vatRate: number;
  if (amountTax > 0 && amountTotal > amountTax) {
    net = amountTotal - amountTax;
    const derived = Math.round((amountTax / net) * 100);
    vatRate = derived > 0 && derived <= 30 ? derived : DEFAULT_VAT_RATE;
  } else {
    net = Math.round(amountTotal / (1 + DEFAULT_VAT_RATE / 100));
    vatRate = DEFAULT_VAT_RATE;
  }

  return {
    clientName: (name || 'Client online').slice(0, 200),
    clientTaxId: null,
    currency,
    lines: [{ description: 'Plată online (Stripe)', quantity: 1, unitPriceCents: net, vatRate }],
    externalOrderRef: ref || null,
  };
}

// ── Generic payment notification → invoice ──────────────────────────────────
// A normalized payment payload that any processor (Netopia / PayU / EuPlătesc)
// can be wired to POST on a confirmed payment. The amount is treated as gross at
// the standard rate unless an explicit `vat_rate` is supplied. Accepts either
// `amount_cents` (integer minor units) or `amount` (decimal string).
export function mapGenericPaymentToInvoice(p: any): MappedOrder | null {
  const amount = Number(p?.amount_cents) > 0 ? Math.round(Number(p.amount_cents)) : toCentsFromDecimalString(p?.amount);
  if (!amount || amount <= 0) return null;

  const currency = String(p?.currency || 'RON').toUpperCase().slice(0, 5);
  const clientName = String(p?.customer_name || p?.name || 'Client').slice(0, 200);
  const clientTaxId = String(p?.customer_tax_id || p?.cui || '').trim() || null;
  const description = String(p?.description || 'Plată online').slice(0, 500);

  const explicit = p?.vat_rate != null ? Number(p.vat_rate) : null;
  let vatRate: number;
  if (explicit != null && explicit >= 0 && explicit <= 30) vatRate = Math.round(explicit);
  else vatRate = DEFAULT_VAT_RATE;
  const net = Math.round(amount / (1 + vatRate / 100));

  return {
    clientName,
    clientTaxId,
    currency,
    lines: [{ description, quantity: 1, unitPriceCents: net, vatRate }],
    externalOrderRef: p?.reference != null ? String(p.reference) : null,
  };
}

// ── Persist a mapped order as an issued invoice ─────────────────────────────
// Allocates the company's default `factura` series and inserts the invoice +
// lines. Server-side computes totals. Returns the new invoice id, or null on
// any failure (caller logs + still returns 200 to the webhook sender).
export async function createInvoiceFromMappedOrder(
  companyId: string,
  userIdNull: string | null,
  mapped: MappedOrder,
  note: string,
): Promise<{ id: string; fullNumber: string; totalCents: number } | null> {
  try {
    if (!mapped.lines.length) return null;

    // Idempotency: e-commerce platforms re-deliver webhooks (retries, at-least-
    // once delivery). The schema has no dedicated external-ref column, but each
    // webhook builds a deterministic `note` that embeds the external order ref
    // (e.g. "Comandă Shopify #1001"). Dedupe on (companyId, notes) so a replay
    // of the same order never creates a duplicate invoice. If a richer order-ref
    // column is added later, switch this lookup to it.
    if (mapped.externalOrderRef) {
      const [dup] = await db.select({ id: transportInvoices.id })
        .from(transportInvoices)
        .where(and(eq(transportInvoices.companyId, companyId), eq(transportInvoices.notes, note)))
        .limit(1);
      if (dup) return null;
    }

    let subtotalCents = 0;
    let vatCents = 0;
    const computedLines = mapped.lines.map((l, idx) => {
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
        code: null,
        description: (l.description || 'Produs').slice(0, 500),
        quantity: q,
        unit: 'buc',
        unitPriceCents: up,
        vatRate: rate,
        lineTotalCents: lineSub + lineVat,
      };
    });
    const totalCents = subtotalCents + vatCents;

    const series = await ensureDefaultSeries(companyId, 'factura', 'external');
    const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id, INVOICE_NUMBER_FORMAT);

    const invoiceId = nanoid();
    const now = new Date();
    const currency = (mapped.currency || 'RON').toUpperCase().slice(0, 5);

    await db.insert(transportInvoices).values({
      id: invoiceId,
      companyId,
      issuedByUserId: userIdNull,
      seriesId: series.id,
      sequenceNumber,
      fullNumber,
      kind: 'factura',
      clientCompanyId: null,
      clientExternalId: null,
      clientNameSnap: (mapped.clientName || 'Client magazin online').slice(0, 200),
      clientTaxIdSnap: mapped.clientTaxId ? String(mapped.clientTaxId).slice(0, 32) : null,
      clientAddressSnap: null,
      currency,
      vatRegime: 'standard',
      subtotalCents,
      vatCents,
      totalCents,
      paidCents: 0,
      status: 'issued',
      issuedAt: now,
      dueAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      language: 'ro',
      precision: 2,
      notes: note,
    });

    if (computedLines.length) {
      await db.insert(transportInvoiceLines).values(computedLines.map((l) => ({ ...l, invoiceId })));
    }

    return { id: invoiceId, fullNumber, totalCents };
  } catch {
    // DB not provisioned locally / transient failure — caller stays 200.
    return null;
  }
}
