// Unit tests for the additional order/payment → invoice mappers:
// PrestaShop, Gomag, Stripe events, and the generic payment payload.
import { describe, it, expect } from 'vitest';
import {
  mapPrestaShopOrderToInvoice,
  mapGomagOrderToInvoice,
  mapStripeEventToInvoice,
  mapGenericPaymentToInvoice,
} from '../src/lib/connectors';

describe('mapPrestaShopOrderToInvoice', () => {
  it('maps products + shipping with company identity', () => {
    const m = mapPrestaShopOrderToInvoice({
      id_order: 42,
      invoice_address: { company: 'Beta SRL', vat_number: 'RO99', firstname: 'A', lastname: 'B' },
      products: [{ product_name: 'Widget', product_quantity: 3, unit_price_tax_excl: '10.00', tax_rate: '21' }],
      total_shipping_tax_excl: '12.00',
    });
    expect(m.clientName).toBe('Beta SRL');
    expect(m.clientTaxId).toBe('RO99');
    expect(m.externalOrderRef).toBe('42');
    expect(m.lines[0]).toMatchObject({ description: 'Widget', quantity: 3, unitPriceCents: 1000, vatRate: 21 });
    expect(m.lines[1]).toMatchObject({ description: 'Transport', unitPriceCents: 1200 });
  });
});

describe('mapGomagOrderToInvoice', () => {
  it('maps billing CUI and VAT given as a fraction', () => {
    const m = mapGomagOrderToInvoice({
      order_id: 'G-7',
      billing: { company: 'Gamma SRL', cui: 'RO123' },
      products: [{ name: 'Produs', quantity: 2, price: '25.50', vat: '0.21' }],
    });
    expect(m.clientName).toBe('Gamma SRL');
    expect(m.clientTaxId).toBe('RO123');
    expect(m.externalOrderRef).toBe('G-7');
    expect(m.lines[0]).toMatchObject({ quantity: 2, unitPriceCents: 2550, vatRate: 21 });
  });
});

describe('mapStripeEventToInvoice', () => {
  it('splits net/VAT from total_details.amount_tax (amounts already in bani)', () => {
    const m = mapStripeEventToInvoice({
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_1', payment_status: 'paid', amount_total: 12100, currency: 'ron',
        total_details: { amount_tax: 2100 }, customer_details: { name: 'Ion P' },
      } },
    });
    expect(m).not.toBeNull();
    expect(m!.clientName).toBe('Ion P');
    expect(m!.lines[0]).toMatchObject({ unitPriceCents: 10000, vatRate: 21 });
    expect(m!.externalOrderRef).toBe('cs_1');
  });

  it('assumes gross at 21% when no tax breakdown', () => {
    const m = mapStripeEventToInvoice({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', amount_received: 12100, currency: 'ron' } },
    });
    expect(m).not.toBeNull();
    // 12100 / 1.21 = 10000 net
    expect(m!.lines[0].unitPriceCents).toBe(10000);
    expect(m!.lines[0].vatRate).toBe(21);
  });

  it('returns null for unpaid sessions and unknown events', () => {
    expect(mapStripeEventToInvoice({ type: 'checkout.session.completed', data: { object: { payment_status: 'unpaid', amount_total: 100 } } })).toBeNull();
    expect(mapStripeEventToInvoice({ type: 'customer.created', data: { object: {} } })).toBeNull();
  });
});

describe('mapGenericPaymentToInvoice', () => {
  it('treats amount as gross at standard rate', () => {
    const m = mapGenericPaymentToInvoice({ amount: '121.00', customer_name: 'Maria', reference: 'NP-9' });
    expect(m).not.toBeNull();
    expect(m!.clientName).toBe('Maria');
    expect(m!.lines[0]).toMatchObject({ unitPriceCents: 10000, vatRate: 21 });
    expect(m!.externalOrderRef).toBe('NP-9');
  });

  it('accepts amount_cents and explicit vat_rate', () => {
    const m = mapGenericPaymentToInvoice({ amount_cents: 11900, vat_rate: 19 });
    expect(m!.lines[0]).toMatchObject({ unitPriceCents: 10000, vatRate: 19 });
  });

  it('returns null without an amount', () => {
    expect(mapGenericPaymentToInvoice({ customer_name: 'X' })).toBeNull();
  });
});
