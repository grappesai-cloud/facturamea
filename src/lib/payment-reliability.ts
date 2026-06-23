// Payment reliability score for a company. Aggregates over their issued
// transport_invoices: % paid on time, average days late on overdue ones,
// open overdue value vs total issued value. Returns a 0-100 score plus the
// raw signals so callers can render a breakdown.
//
// Scoring weights:
//   on-time ratio:    70 points  (paidOnTime / paidTotal)
//   overdue penalty: -30 points  (openOverdueValue / openValue)
//   incident penalty: -10 points each
import { db } from '../db';
import { transportInvoices } from '../db/schema';
import { and, eq, sql, isNotNull } from 'drizzle-orm';
import { isOverdue } from './dates';

export interface ReliabilitySignals {
  totalIssued: number;          // count of factura status≠voided
  totalPaid: number;            // count fully paid
  paidOnTime: number;           // paid before due date
  paidLate: number;             // paid after due date
  avgDaysLate: number;          // average lateness across late-paid invoices
  openCount: number;            // unpaid not voided
  openOverdueCount: number;     // unpaid past due
  openValueCents: number;       // total of unpaid totalCents
  openOverdueValueCents: number;
  score: number;                // 0..100
}

export async function computePaymentReliability(companyId: string): Promise<ReliabilitySignals> {
  const now = new Date();

  // Aggregate all factura issued by this company. We treat the issuer as the
  // "subject" — i.e. their reputation as a payee, since they are the one whose
  // clients pay them. The score reflects how reliably they get paid.
  // (Future: invert for buyer-side reputation by aggregating invoices issued
  // TO their clientCompanyId.)
  const rows = await db.select({
    totalCents: transportInvoices.totalCents,
    paidCents: transportInvoices.paidCents,
    issuedAt: transportInvoices.issuedAt,
    dueAt: transportInvoices.dueAt,
    paidAt: transportInvoices.paidAt,
    status: transportInvoices.status,
  }).from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId),
    eq(transportInvoices.kind, 'factura'),
    // Exclude voided drafts AND storno'd (reversed) invoices — this query is
    // kind='factura' only, so the negative storno isn't here to net the original.
    sql`${transportInvoices.status} NOT IN ('voided', 'reversed')`,
    isNotNull(transportInvoices.issuedAt),
  ));

  let totalIssued = 0, totalPaid = 0, paidOnTime = 0, paidLate = 0, sumDaysLate = 0;
  let openCount = 0, openOverdueCount = 0, openValueCents = 0, openOverdueValueCents = 0;

  for (const r of rows) {
    totalIssued++;
    const due = r.dueAt ? new Date(r.dueAt) : null;

    if (r.status === 'paid' && r.paidAt) {
      totalPaid++;
      if (due) {
        const days = Math.floor((new Date(r.paidAt).getTime() - due.getTime()) / 86400000);
        if (days <= 0) paidOnTime++;
        else { paidLate++; sumDaysLate += days; }
      } else {
        paidOnTime++;
      }
    } else {
      openCount++;
      const remaining = (r.totalCents ?? 0) - (r.paidCents ?? 0);
      openValueCents += remaining;
      if (isOverdue(r.dueAt)) {
        openOverdueCount++;
        openOverdueValueCents += remaining;
      }
    }
  }

  const avgDaysLate = paidLate > 0 ? sumDaysLate / paidLate : 0;
  // Score components
  const onTimeRatio = totalPaid > 0 ? paidOnTime / totalPaid : 1;
  const onTimeScore = onTimeRatio * 70;
  const overdueRatio = openValueCents > 0 ? openOverdueValueCents / openValueCents : 0;
  const overduePenalty = overdueRatio * 30;

  let score = Math.round(30 + onTimeScore - overduePenalty);
  if (totalIssued === 0) score = 50; // neutral when no history
  score = Math.max(0, Math.min(100, score));

  return {
    totalIssued, totalPaid, paidOnTime, paidLate,
    avgDaysLate: Math.round(avgDaysLate * 10) / 10,
    openCount, openOverdueCount,
    openValueCents, openOverdueValueCents,
    score,
  };
}

export function reliabilityLabel(score: number): { label: string; tone: 'green' | 'amber' | 'red' } {
  if (score >= 85) return { label: 'Excelent', tone: 'green' };
  if (score >= 65) return { label: 'Bun', tone: 'green' };
  if (score >= 45) return { label: 'Mediu', tone: 'amber' };
  if (score >= 25) return { label: 'Slab', tone: 'red' };
  return { label: 'Critic', tone: 'red' };
}
