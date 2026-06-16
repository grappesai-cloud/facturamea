import { describe, expect, it } from 'vitest';
import { generateEFacturaXml, type InvoiceInput } from '../src/lib/efactura';

const baseSupplier = {
  name: 'FACTURAMEA SRL',
  cui: '12345678',
  vatPayer: true,
  registrationNumber: 'J40/1234/2020',
  address: { street: 'Str. Exemplu 1', city: 'București', postalCode: '010101', country: 'RO' },
};
const baseCustomer = {
  name: 'CLIENT SRL',
  cui: '87654321',
  vatPayer: true,
  address: { street: 'Str. Client 2', city: 'Cluj', country: 'RO' },
};

function base(over: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    invoiceNumber: 'FAC-0001',
    issueDate: '2026-06-16',
    dueDate: '2026-07-16',
    currency: 'RON',
    supplier: baseSupplier,
    customer: baseCustomer,
    lines: [{ description: 'Serviciu', quantity: 1, unit: 'C62', unitPriceCents: 10000, vatPercent: 21 }],
    ...over,
  };
}

const amt = (xml: string, re: RegExp) => Number(xml.match(re)?.[1]);

describe('e-Factura UBL / CIUS-RO', () => {
  it('emite câmpurile obligatorii la nivel de document', () => {
    const xml = generateEFacturaXml(base());
    expect(xml).toContain('CIUS-RO:1.0.1');
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    // BT-10 BuyerReference obligatoriu
    expect(xml).toMatch(/<cbc:BuyerReference>FAC-0001<\/cbc:BuyerReference>/);
    // defalcare TVA prezentă
    expect(xml).toContain('<cac:TaxSubtotal>');
  });

  it('pune nr. reg. comerț în PartyLegalEntity/CompanyID, nu în CompanyLegalForm', () => {
    const xml = generateEFacturaXml(base());
    expect(xml).toContain('<cbc:CompanyID>J40/1234/2020</cbc:CompanyID>');
    expect(xml).not.toContain('CompanyLegalForm');
    // VAT id în PartyTaxScheme
    expect(xml).toContain('<cbc:CompanyID>RO12345678</cbc:CompanyID>');
  });

  it('totalurile respectă BR-CO (net, TVA, total)', () => {
    // 21% pe 100.00 + 9% pe 50.00 → net 150.00, TVA 21+4.5=25.50, total 175.50
    const xml = generateEFacturaXml(
      base({
        lines: [
          { description: 'A', quantity: 1, unit: 'C62', unitPriceCents: 10000, vatPercent: 21 },
          { description: 'B', quantity: 1, unit: 'C62', unitPriceCents: 5000, vatPercent: 9 },
        ],
      }),
    );
    expect(
      amt(
        xml,
        /<cbc:LineExtensionAmount currencyID="RON">([\d.]+)<\/cbc:LineExtensionAmount>\s*<cbc:TaxExclusiveAmount/,
      ),
    ).toBe(150.0);
    expect(amt(xml, /<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="RON">([\d.]+)/)).toBe(25.5);
    expect(amt(xml, /<cbc:TaxInclusiveAmount currencyID="RON">([\d.]+)/)).toBe(175.5);
    expect(amt(xml, /<cbc:PayableAmount currencyID="RON">([\d.]+)/)).toBe(175.5);
    // două subtotaluri (21% și 9%)
    expect(xml.match(/<cac:TaxSubtotal>/g)?.length).toBe(2);
  });

  it('TVA pe categorie = bază * cotă rotunjit (BR-S-09)', () => {
    // 3 linii a 33.33 la 21% → bază 99.99, TVA categorie = round(99.99*21%) = 21.00
    const xml = generateEFacturaXml(
      base({
        lines: Array.from({ length: 3 }, () => ({
          description: 'X',
          quantity: 1,
          unit: 'C62',
          unitPriceCents: 3333,
          vatPercent: 21,
        })),
      }),
    );
    expect(amt(xml, /<cbc:TaxableAmount currencyID="RON">([\d.]+)/)).toBe(99.99);
    expect(amt(xml, /<cac:TaxSubtotal>[\s\S]*?<cbc:TaxAmount currencyID="RON">([\d.]+)/)).toBe(21.0);
  });

  it('linie cu cotă zero (Z) nu necesită motiv de scutire', () => {
    const xml = generateEFacturaXml(
      base({ lines: [{ description: 'Z', quantity: 1, unit: 'C62', unitPriceCents: 10000, vatPercent: 0 }] }),
    );
    expect(xml).toContain('<cbc:ID>Z</cbc:ID>');
    expect(xml).not.toContain('TaxExemptionReason');
  });

  it('taxare inversă (AE) emite codul de scutire', () => {
    const xml = generateEFacturaXml(
      base({
        lines: [
          {
            description: 'AE',
            quantity: 1,
            unit: 'C62',
            unitPriceCents: 10000,
            vatPercent: 0,
            vatCategory: 'AE',
          },
        ],
      }),
    );
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:TaxExemptionReason>Taxare inversă</cbc:TaxExemptionReason>');
  });

  it('valută străină: TaxCurrencyCode RON + TVA în RON + curs', () => {
    const xml = generateEFacturaXml(
      base({
        currency: 'EUR',
        exchangeRate: 4.97,
        lines: [{ description: 'EUR', quantity: 1, unit: 'C62', unitPriceCents: 10000, vatPercent: 21 }],
      }),
    );
    expect(xml).toContain('<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>');
    expect(xml).toContain('<cbc:CalculationRate>4.9700</cbc:CalculationRate>');
    // TVA doc = 21.00 EUR → 21*4.97 = 104.37 RON
    expect(xml).toContain('<cbc:TaxAmount currencyID="RON">104.37</cbc:TaxAmount>');
    expect(amt(xml, /<cbc:TaxAmount currencyID="EUR">([\d.]+)/)).toBe(21.0);
  });

  it('escapează caractere XML periculoase', () => {
    const xml = generateEFacturaXml(base({ notes: 'A & B <test>' }));
    expect(xml).toContain('A &amp; B &lt;test&gt;');
  });
});
