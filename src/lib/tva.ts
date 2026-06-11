import { db } from '../db';
import { invoiceTvaRates } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Default VAT-rate catalogue seeded the first time a company opens the TVA
// settings (or emits an invoice). Mirrors the Oblio "Cote TVA" list, trimmed
// to what is relevant for road transport. `regime` carries the fiscal regime
// onto transportInvoices.vatRegime. Per client spec the reduced 11% rate is
// seeded inactive ("în afara de numărul 2, nu se aplică la transport").
export const DEFAULT_TVA_RATES: Array<{
  name: string; percent: number; regime: string; description?: string; isDefault?: boolean; isActive?: boolean;
}> = [
  { name: 'Normală', percent: 21, regime: 'standard', isDefault: true },
  { name: 'Redusă', percent: 11, regime: 'standard', isActive: false },
  { name: 'Scutită', percent: 0, regime: 'exempt' },
  { name: 'Taxare inversă', percent: 0, regime: 'reverse_charge', description: 'Taxare inversă conform Art. 331 alin 2(C)' },
  { name: 'TVA la încasare', percent: 21, regime: 'tva_la_incasare', description: 'TVA exigibilă la încasarea facturii' },
  { name: 'Export extra-UE', percent: 0, regime: 'export_extra_eu', description: 'Operațiune scutită cu drept de deducere' },
  { name: 'Livrare intra-UE', percent: 0, regime: 'intra_eu', description: 'Scutit conform Art. 294' },
];

// Returns the company's TVA-rate catalogue, seeding defaults on first access.
export async function ensureTvaRates(companyId: string) {
  const existing = await db.select().from(invoiceTvaRates)
    .where(eq(invoiceTvaRates.companyId, companyId))
    .orderBy(asc(invoiceTvaRates.position), asc(invoiceTvaRates.createdAt));
  if (existing.length) return existing;

  const rows = DEFAULT_TVA_RATES.map((r, i) => ({
    id: nanoid(),
    companyId,
    name: r.name,
    percent: r.percent,
    regime: r.regime,
    description: r.description ?? null,
    isDefault: !!r.isDefault,
    position: i,
    isActive: r.isActive !== false,
  }));
  await db.insert(invoiceTvaRates).values(rows);
  return db.select().from(invoiceTvaRates)
    .where(eq(invoiceTvaRates.companyId, companyId))
    .orderBy(asc(invoiceTvaRates.position), asc(invoiceTvaRates.createdAt));
}
