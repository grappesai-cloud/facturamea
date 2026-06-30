import { describe, it, expect } from 'vitest';
import { parseExpenseText } from '../src/lib/expense-pdf';

// These fixtures carry no valid RO CUI, so the parser never hits the ANAF
// lookup network call — the assertions stay deterministic and offline.
async function fields(text: string) {
  const r = await parseExpenseText(text);
  if (!r.ok) throw new Error('parse failed: ' + r.error);
  return r.fields;
}

describe('parseExpenseText — currency + amount extraction', () => {
  it('foreign EUR invoice, intl number format, all on labelled lines', async () => {
    const f = await fields(
      'ACME Software Ltd\nSubtotal: 1,000.00 EUR\nVAT 20%: 200.00 EUR\nTotal to pay: 1,200.00 EUR',
    );
    expect(f.currency).toBe('EUR');
    expect(f.netCents).toBe(100000);
    expect(f.vatCents).toBe(20000);
    expect(f.totalCents).toBe(120000);
  });

  it('RON invoice, German number format, values on the next line (columns)', async () => {
    const f = await fields(
      'Furnizor Demo\nTotal fara TVA\n2.000,00 lei\nT.V.A. 19%\n380,00 lei\nTotal de plata\n2.380,00 lei',
    );
    expect(f.currency).toBe('RON');
    expect(f.netCents).toBe(200000);
    expect(f.vatCents).toBe(38000);
    expect(f.totalCents).toBe(238000);
  });

  it('EUR with symbol, ignores the printed RON equivalent', async () => {
    const f = await fields('Hosting GmbH\nTotal: € 49,90\nechivalent 248,01 RON');
    expect(f.currency).toBe('EUR');
    expect(f.totalCents).toBe(4990);
  });

  it('USD with symbol', async () => {
    const f = await fields('Total amount due $ 350.00\nTax: $ 0.00');
    expect(f.currency).toBe('USD');
    expect(f.totalCents).toBe(35000);
  });

  it('all three amounts on one line, in label order', async () => {
    const f = await fields('Valoare: 100,00 lei  T.V.A. 19%: 19,00 lei  Total de plata: 119,00 lei');
    expect(f.netCents).toBe(10000);
    expect(f.vatCents).toBe(1900);
    expect(f.totalCents).toBe(11900);
  });

  it('retail receipt: derives net from total minus stated VAT', async () => {
    const f = await fields('MAGAZIN DEMO\nTOTAL 47,90 LEI\ndin care TVA 19% 7,65');
    expect(f.currency).toBe('RON');
    expect(f.totalCents).toBe(4790);
    expect(f.vatCents).toBe(765);
    expect(f.netCents).toBe(4025);
  });
});
