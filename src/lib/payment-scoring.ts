import { db } from '../db';
import { transportInvoices, incidents, companies } from '../db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { isOverdue } from './dates';

const DAY = 24 * 60 * 60 * 1000;

export interface PaymentBehavior {
  score: number | null;     // 0..100 Payment Reliability Score, null = no history
  avgDaysToPay: number | null; // mean (paidAt - dueAt) in days; negative = pays early
  paidCount: number;
  overdueCount: number;
  incidentCount: number;
  sampleSize: number;
}

// Computes a company's payment behaviour from the invoices issued *to* it on
// the platform (clientCompanyId = the company) plus payment-delay incidents
// raised against it. This is the "payment behavior engine" — reputation flows
// from how reliably a party settles its invoices, not just from star ratings.
export async function computePaymentBehavior(companyId: string): Promise<PaymentBehavior> {
  const invoices = await db.select({
    status: transportInvoices.status,
    dueAt: transportInvoices.dueAt,
    paidAt: transportInvoices.paidAt,
    totalCents: transportInvoices.totalCents,
    paidCents: transportInvoices.paidCents,
  }).from(transportInvoices).where(and(
    eq(transportInvoices.clientCompanyId, companyId),
    eq(transportInvoices.kind, 'factura'),
    sql`${transportInvoices.status} <> 'draft'`,
    sql`${transportInvoices.status} <> 'voided'`,
  ));

  const now = Date.now();
  const delays: number[] = [];
  let overdueCount = 0;
  for (const inv of invoices) {
    const due = inv.dueAt ? new Date(inv.dueAt).getTime() : null;
    if (inv.paidAt && due) {
      delays.push((new Date(inv.paidAt).getTime() - due) / DAY);
    } else if (isOverdue(inv.dueAt) && (inv.paidCents ?? 0) < (inv.totalCents ?? 0)) {
      overdueCount++;
    }
  }

  const [{ cnt: incidentCount } = { cnt: 0 }] = await db.select({
    cnt: sql<number>`COUNT(*)`,
  }).from(incidents).where(and(
    eq(incidents.againstCompanyId, companyId),
    eq(incidents.category, 'payment_delay'),
    sql`${incidents.status} <> 'withdrawn'`,
  ));

  const sampleSize = delays.length + overdueCount + Number(incidentCount);
  if (sampleSize === 0) {
    return { score: null, avgDaysToPay: null, paidCount: 0, overdueCount: 0, incidentCount: 0, sampleSize: 0 };
  }

  const avgDaysToPay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null;

  let score = 100;
  if (avgDaysToPay != null && avgDaysToPay > 0) score -= Math.min(40, avgDaysToPay * 2);
  score -= Math.min(30, overdueCount * 5);
  score -= Math.min(40, Number(incidentCount) * 10);
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    avgDaysToPay: avgDaysToPay != null ? Math.round(avgDaysToPay * 10) / 10 : null,
    paidCount: delays.length,
    overdueCount,
    incidentCount: Number(incidentCount),
    sampleSize,
  };
}

// Recomputes and persists the rollup columns on the company row.
export async function recomputeCompanyPaymentScore(companyId: string): Promise<PaymentBehavior> {
  const b = await computePaymentBehavior(companyId);
  await db.update(companies).set({
    paymentScore: b.score,
    avgDaysToPay: b.avgDaysToPay,
    paymentIncidentCount: b.incidentCount,
    paymentScoreUpdatedAt: new Date(),
  }).where(eq(companies.id, companyId));
  return b;
}

// Human-readable tier for a score (used for badges + colours).
export function scoreTier(score: number | null): { label: string; tone: string } {
  if (score == null) return { label: 'Fără istoric', tone: 'bg-[#F0F0EC] text-[#6B6B68]' };
  if (score >= 90) return { label: 'Excelent', tone: 'bg-[#D1FAE5] text-[#065F46]' };
  if (score >= 75) return { label: 'Bun', tone: 'bg-[#DBEAFE] text-[#1E3A8A]' };
  if (score >= 50) return { label: 'Mediu', tone: 'bg-[#FEF3C7] text-[#B45309]' };
  return { label: 'Risc ridicat', tone: 'bg-[#FEE2E2] text-[#B91C1C]' };
}

// A short, practical AI-style insight string for a payer's behaviour.
export function paymentInsight(b: PaymentBehavior): string | null {
  if (b.sampleSize === 0) return null;
  if (b.incidentCount > 0) {
    return `${b.incidentCount} incident${b.incidentCount === 1 ? '' : 'e'} de plată confirmat${b.incidentCount === 1 ? '' : 'e'}. Recomandăm plată în avans sau garanție.`;
  }
  if (b.overdueCount > 0) {
    return `Are ${b.overdueCount} factur${b.overdueCount === 1 ? 'ă' : 'i'} restant${b.overdueCount === 1 ? 'ă' : 'e'} peste scadență în acest moment.`;
  }
  if (b.avgDaysToPay != null) {
    if (b.avgDaysToPay <= 0) return `Plătește la timp (în medie cu ${Math.abs(b.avgDaysToPay)} zile înainte de scadență).`;
    if (b.avgDaysToPay <= 3) return `Plătește aproape la timp (în medie +${b.avgDaysToPay} zile față de scadență).`;
    return `Plătește în medie cu ${b.avgDaysToPay} zile peste scadență.`;
  }
  return null;
}
