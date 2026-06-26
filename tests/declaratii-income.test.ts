// Unit tests for the income-tax declarations (D100 micro, D212 PFA) — the
// pure computation + XML/CSV shape. DB-backed collectors aren't exercised here;
// we feed the pre-aggregated structures the generators consume.
import { describe, it, expect } from 'vitest';
import {
  computeD100Summary,
  generateD100Xml,
  generateD100Csv,
  generateD212Xml,
  generateD212Csv,
  type DeclaratieData,
  type D212Data,
} from '../src/lib/declaratii';

function baseData(overrides: Partial<DeclaratieData> = {}): DeclaratieData {
  return {
    declarant: { cui: '12345678', name: 'Test SRL', rawCui: 'RO12345678' },
    period: { from: '2026-04-01', to: '2026-06-30', month: 4, year: 2026 },
    livrari: [],
    livrariTotals: { baseCents: 10_000_00, vatCents: 0, docCount: 5 },
    achizitii: [],
    achizitiiTotals: { baseCents: 0, vatCents: 0, docCount: 0 },
    ...overrides,
  };
}

describe('D100 (impozit micro)', () => {
  it('computes 1% of turnover and derives the trimester', () => {
    const s = computeD100Summary(baseData(), 1);
    expect(s.baseCents).toBe(10_000_00);
    expect(s.ratePct).toBe(1);
    expect(s.taxCents).toBe(100_00); // 1% of 10.000 RON = 100 RON
    expect(s.trimestru).toBe(2); // luna 4 → T2
  });

  it('computes 3% when no employees', () => {
    const s = computeD100Summary(baseData(), 3);
    expect(s.ratePct).toBe(3);
    expect(s.taxCents).toBe(300_00);
  });

  it('falls back to 1% for any non-3 rate', () => {
    expect(computeD100Summary(baseData(), 999).ratePct).toBe(1);
  });

  it('emits well-formed XML with the cod bugetar 1170', () => {
    const xml = generateD100Xml(baseData(), 1);
    expect(xml).toContain('<codBugetar>1170</codBugetar>');
    expect(xml).toContain('<datorat>100.00</datorat>');
    expect(xml).toContain('trimestru="2"');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('CSV carries the headline figures', () => {
    const csv = generateD100Csv(baseData(), 1);
    expect(csv).toContain('Impozit datorat (RON)');
    expect(csv).toContain('100.00');
  });
});

describe('D212 (declarația unică PFA)', () => {
  const d: D212Data = {
    declarant: { cui: '1900101080010', name: 'Popescu Ion PFA', rawCui: '1900101080010' },
    year: 2026,
    venitBrutCents: 120_000_00,
    cheltuieliCents: 30_000_00,
    venitNetCents: 90_000_00,
    impozitCents: 9_000_00, // 10% of 90.000
    nrFacturiIncasate: 24,
  };

  it('XML reflects 10% on the net income', () => {
    const xml = generateD212Xml(d);
    expect(xml).toContain('<venitNet>90000.00</venitNet>');
    expect(xml).toContain('<impozitDatorat>9000.00</impozitDatorat>');
    expect(xml).toContain('<cotaImpozit>10</cotaImpozit>');
  });

  it('CSV flags that CAS/CASS must be confirmed', () => {
    const csv = generateD212Csv(d);
    expect(csv).toContain('Venit net (RON)');
    expect(csv).toContain('90000.00');
    expect(csv.toLowerCase()).toContain('cas/cass');
  });
});
