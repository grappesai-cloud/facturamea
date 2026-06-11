// Recurring invoice engine.
//
// Schedule rows live in `invoice_recurring`. The cron runner (called from
// /api/cron/recurring-invoices) finds rows with next_run_at <= today and
// active=true, then emits one factură per row using a JSON snapshot of
// the lines. After success, advances next_run_at by the frequency.

import { db } from '../db';
import {
  invoiceRecurring, transportInvoices, transportInvoiceLines, companies, invoiceClients,
} from '../db/schema';
import { eq, and, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureDefaultSeries, nextSeriesNumber, INVOICE_NUMBER_FORMAT } from './invoicing';
import { captureBnrSnapshot } from './bnr-fx';

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export function advanceDate(currentIso: string, freq: RecurringFrequency): string {
  const d = new Date(currentIso + 'T00:00:00Z');
  switch (freq) {
    case 'weekly':    d.setUTCDate(d.getUTCDate() + 7); break;
    case 'biweekly':  d.setUTCDate(d.getUTCDate() + 14); break;
    case 'monthly':   d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly':    d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  return d.toISOString().slice(0, 10);
}

interface SnapshotLine { description: string; quantity: number; unit?: string; unitPriceCents: number; vatRate: number }

export interface RunResult {
  processed: number;
  generated: Array<{ recurringId: string; invoiceId: string; fullNumber: string }>;
  errors: Array<{ recurringId: string; error: string }>;
}

export async function runRecurringInvoices(today: string = new Date().toISOString().slice(0, 10)): Promise<RunResult> {
  const due = await db.select().from(invoiceRecurring)
    .where(and(eq(invoiceRecurring.isActive, true), lte(invoiceRecurring.nextRunAt, today)));

  const result: RunResult = { processed: due.length, generated: [], errors: [] };

  for (const r of due) {
    try {
      const out = await emitOneRecurring(r, today);
      result.generated.push({ recurringId: r.id, invoiceId: out.invoiceId, fullNumber: out.fullNumber });
    } catch (e: any) {
      result.errors.push({ recurringId: r.id, error: e?.message || String(e) });
    }
  }

  return result;
}

async function emitOneRecurring(r: typeof invoiceRecurring.$inferSelect, today: string): Promise<{ invoiceId: string; fullNumber: string }> {
  // Resolve client snapshot.
  let clientName = '', clientTaxId: string | null = null, clientAddress: string | null = null;
  if (r.clientCompanyId) {
    const [c] = await db.select({ name: companies.name, cui: companies.cui, address: companies.address }).from(companies).where(eq(companies.id, r.clientCompanyId)).limit(1);
    if (c) { clientName = c.name; clientTaxId = c.cui; clientAddress = c.address ?? null; }
  } else if (r.clientExternalId) {
    const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, r.clientExternalId)).limit(1);
    if (c) {
      clientName = c.name; clientTaxId = c.taxId ?? null;
      clientAddress = [c.address, c.city, c.county, c.country].filter(Boolean).join(', ') || null;
    }
  }
  if (!clientName) throw new Error('Client snapshot missing on recurring template');

  const lines = JSON.parse(r.linesJson) as SnapshotLine[];
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('linesJson empty');

  // Compute totals server-side.
  let subtotalCents = 0, vatCents = 0;
  const computed = lines.map((l, idx) => {
    const q = Number(l.quantity) || 0;
    const up = Math.round(Number(l.unitPriceCents) || 0);
    const sub = Math.round(q * up);
    const rate = Math.max(0, Number(l.vatRate) || 0);
    const lineVat = Math.round((sub * rate) / 100);
    subtotalCents += sub; vatCents += lineVat;
    return {
      id: nanoid(), position: idx,
      description: (l.description || '').trim(),
      quantity: q, unit: (l.unit || 'buc').slice(0, 16),
      unitPriceCents: up, vatRate: rate,
      lineTotalCents: sub + lineVat,
    };
  });
  const totalCents = subtotalCents + vatCents;

  // Reserve series number.
  const series = r.seriesId ? { id: r.seriesId } : await ensureDefaultSeries(r.companyId, 'factura');
  const { fullNumber, number: sequenceNumber } = await nextSeriesNumber(series.id, INVOICE_NUMBER_FORMAT);

  // BNR snapshot if non-RON.
  const currency = (r.currency || 'RON').toUpperCase().slice(0, 5);
  const bnr = await captureBnrSnapshot(today, currency).catch(() => null);

  // Pull TVA-la-încasare default off the issuer company.
  const [issuer] = await db.select({ tva: companies.tvaAtCollection }).from(companies).where(eq(companies.id, r.companyId)).limit(1);

  const invoiceId = nanoid();
  const issuedAt = new Date();
  const dueAt = r.paymentTermDays ? new Date(issuedAt.getTime() + r.paymentTermDays * 24 * 60 * 60 * 1000) : null;

  await db.insert(transportInvoices).values({
    id: invoiceId,
    companyId: r.companyId,
    issuedByUserId: r.createdByUserId,
    seriesId: series.id,
    sequenceNumber, fullNumber, kind: 'factura',
    clientCompanyId: r.clientCompanyId,
    clientExternalId: r.clientExternalId,
    clientNameSnap: clientName,
    clientTaxIdSnap: clientTaxId,
    clientAddressSnap: clientAddress,
    currency, vatRegime: r.vatRegime || 'standard',
    subtotalCents, vatCents, totalCents, paidCents: 0,
    status: 'issued', issuedAt, dueAt,
    bnrRate: bnr?.rate ?? null,
    bnrRateDate: bnr?.rateDate ?? null,
    vatAtCollection: issuer?.tva ?? false,
    notes: `Generată automat din abonamentul "${r.name}"`,
  });

  if (computed.length) {
    await db.insert(transportInvoiceLines).values(computed.map((l) => ({ ...l, invoiceId })));
  }

  const nextRun = advanceDate(r.nextRunAt, r.frequency as RecurringFrequency);
  const totalRunsNew = (r.totalRuns || 0) + 1;
  const shouldDeactivate =
    (r.maxRuns != null && totalRunsNew >= r.maxRuns) ||
    (r.endAt != null && nextRun > r.endAt);

  await db.update(invoiceRecurring).set({
    lastRunAt: today, nextRunAt: nextRun,
    totalRuns: totalRunsNew,
    isActive: shouldDeactivate ? false : r.isActive,
    updatedAt: new Date(),
  }).where(eq(invoiceRecurring.id, r.id));

  return { invoiceId, fullNumber };
}
