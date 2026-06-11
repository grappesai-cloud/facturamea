// E-commerce connector helpers: map WooCommerce / Shopify orders into our
// internal invoice shape and persist them via the shared invoicing series
// allocator. All DB access is wrapped in try/catch by the caller (webhooks);
// the mapping functions are pure and never touch the DB.
import { db } from '../db';
import { transportInvoices, transportInvoiceLines } from '../db/schema';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT } from './invoicing';

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
