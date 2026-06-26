// Unit tests for the eMag order → invoice mapper. Pure function, no DB/network.
import { describe, it, expect } from 'vitest';
import { mapEmagOrderToInvoice } from '../src/lib/connectors';

describe('mapEmagOrderToInvoice', () => {
  it('maps a company order with CUI and per-unit prices without VAT', () => {
    const order = {
      id: 778899,
      currency: 'RON',
      customer: { legal_entity: '1', company: 'ACME SRL', code: 'RO12345678', name: 'Ion Pop' },
      products: [
        { name: 'Tricou', quantity: 2, sale_price: '50.00', vat: '0.21' },
        { name: 'Șapcă', quantity: 1, sale_price: '30.00', vat: '21' },
      ],
      shipping_tax: '15.00',
    };
    const m = mapEmagOrderToInvoice(order);
    expect(m.clientName).toBe('ACME SRL');
    expect(m.clientTaxId).toBe('RO12345678');
    expect(m.currency).toBe('RON');
    expect(m.externalOrderRef).toBe('778899');
    // 2 products + 1 shipping line
    expect(m.lines).toHaveLength(3);
    expect(m.lines[0]).toMatchObject({ description: 'Tricou', quantity: 2, unitPriceCents: 5000, vatRate: 21 });
    // vat given as "21" (percent) also normalises to 21
    expect(m.lines[1].vatRate).toBe(21);
    expect(m.lines[2]).toMatchObject({ description: 'Transport', quantity: 1, unitPriceCents: 1500, vatRate: 21 });
  });

  it('treats a natural person as a no-tax-id client', () => {
    const order = {
      id: 1,
      customer: { legal_entity: '0', name: 'Maria Ionescu' },
      products: [{ name: 'Carte', quantity: 1, sale_price: '40.00' }],
    };
    const m = mapEmagOrderToInvoice(order);
    expect(m.clientName).toBe('Maria Ionescu');
    expect(m.clientTaxId).toBeNull();
    expect(m.lines).toHaveLength(1);
    // no vat field → defaults to the RO standard 21%
    expect(m.lines[0].vatRate).toBe(21);
  });

  it('falls back to a single placeholder line when no products', () => {
    const m = mapEmagOrderToInvoice({ id: 5, customer: {}, products: [] });
    expect(m.clientName).toBe('Client eMag');
    expect(m.lines).toHaveLength(1);
    expect(m.lines[0].description).toBe('Comandă eMag');
  });

  it('ignores an out-of-range VAT and keeps the default', () => {
    const m = mapEmagOrderToInvoice({ id: 9, customer: { name: 'X' }, products: [{ name: 'P', quantity: 1, sale_price: '10', vat: '99' }] });
    expect(m.lines[0].vatRate).toBe(21);
  });
});
