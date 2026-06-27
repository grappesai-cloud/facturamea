// Deterministic bank reconciliation — NO AI, zero external calls. Scores each
// unreconciled bank transaction against open invoices (incoming) / expenses
// (outgoing) using amount, document number, counterparty name and date, then
// auto-confirms ONLY high-confidence, unambiguous matches. Everything else is
// left for the accountant to review manually (the existing per-tx flow), and
// transactions with no candidate at all are reported as "missing document".
import { db } from '../db';
import { bankTransactions, transportInvoices, expenses, transportInvoicePayments } from '../db/schema';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Normalize for loose "appears in text" / token matching.
function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[\s.\-/]+/g, '');
}
// Significant tokens (>= 4 chars), strips common legal-form noise (srl, sa, pfa…).
const STOP = new Set(['srl', 'sa', 'pfa', 'srld', 'snc', 'scs', 'company', 'firma', 'the', 'and']);
function tokens(s: string | null | undefined): string[] {
  return (s || '').toLowerCase().split(/[^a-z0-9ăâîșț]+/i).filter((t) => t.length >= 4 && !STOP.has(t));
}
function nameMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = tokens(a), tb = new Set(tokens(b));
  return ta.some((t) => tb.has(t));
}

export type Confidence = 'high' | 'medium' | 'none';
export interface MatchResult { type: 'invoice' | 'expense'; id: string; confidence: Confidence; reason: string }

// Score one document against one transaction. `target` is the positive amount.
function scoreDoc(opts: {
  outstanding: number; target: number; docNumber: string | null | undefined; party: string | null | undefined;
  haystack: string; counterparty: string | null | undefined;
}): { confidence: Confidence; reason: string; exact: boolean } {
  const { outstanding, target, docNumber, party, haystack, counterparty } = opts;
  if (outstanding <= 0) return { confidence: 'none', reason: '', exact: false };
  const exact = outstanding === target;
  const byNumber = !!docNumber && norm(docNumber).length >= 3 && haystack.includes(norm(docNumber));
  const byName = nameMatch(counterparty, party);
  // High = exact amount corroborated by an independent signal (number or name).
  if (exact && (byNumber || byName)) return { confidence: 'high', reason: byNumber ? 'sumă + număr' : 'sumă + partener', exact };
  if (exact || byNumber) return { confidence: 'medium', reason: exact ? 'sumă exactă' : 'număr document', exact };
  return { confidence: 'none', reason: '', exact };
}

/**
 * Auto-reconcile a company's unreconciled bank transactions. Confirms only
 * high-confidence, unambiguous matches (exactly one high candidate, and the
 * document isn't claimed by another transaction in this batch). Returns counts.
 */
export async function autoReconcileCompany(
  companyId: string, userId: string | null, accountId?: string | null,
): Promise<{ matched: number; ambiguous: number; missing: number; reviewed: number }> {
  const where = accountId
    ? and(eq(bankTransactions.companyId, companyId), eq(bankTransactions.reconciled, false), eq(bankTransactions.accountId, accountId))
    : and(eq(bankTransactions.companyId, companyId), eq(bankTransactions.reconciled, false));
  const txs = await db.select().from(bankTransactions).where(where).limit(1000);
  if (!txs.length) return { matched: 0, ambiguous: 0, missing: 0, reviewed: 0 };

  // Load open documents once.
  const invoices = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId), eq(transportInvoices.kind, 'factura'),
    inArray(transportInvoices.status, ['issued', 'sent', 'partial', 'overdue']),
  )).limit(2000);
  const exps = await db.select().from(expenses).where(and(
    eq(expenses.companyId, companyId), inArray(expenses.status, ['unpaid', 'partial']),
  )).limit(2000);

  const claimed = new Set<string>();   // doc ids already taken in this batch
  let matched = 0, ambiguous = 0, missing = 0, reviewed = 0;

  for (const tx of txs) {
    const target = Math.abs(tx.amountCents);
    if (target <= 0) continue;
    const haystack = norm(`${tx.description || ''} ${tx.reference || ''}`);
    const highs: { type: 'invoice' | 'expense'; id: string; reason: string }[] = [];
    let anyCandidate = false;

    if (tx.amountCents > 0) {
      for (const inv of invoices) {
        if (claimed.has(inv.id)) continue;
        if ((tx.currency || 'RON') !== (inv.currency || 'RON')) continue; // no FX auto-match
        const outstanding = (inv.totalCents || 0) - (inv.paidCents || 0);
        const s = scoreDoc({ outstanding, target, docNumber: inv.fullNumber, party: inv.clientNameSnap, haystack, counterparty: tx.counterparty });
        if (s.confidence !== 'none') anyCandidate = true;
        if (s.confidence === 'high') highs.push({ type: 'invoice', id: inv.id, reason: s.reason });
      }
    } else {
      for (const ex of exps) {
        if (claimed.has(ex.id)) continue;
        const outstanding = (ex.totalCents || 0) - (ex.paidCents || 0);
        const s = scoreDoc({ outstanding, target, docNumber: ex.documentNumber, party: ex.supplierNameSnap, haystack, counterparty: tx.counterparty });
        if (s.confidence !== 'none') anyCandidate = true;
        if (s.confidence === 'high') highs.push({ type: 'expense', id: ex.id, reason: s.reason });
      }
    }

    if (highs.length === 1) {
      const m = highs[0];
      try {
        await applyMatch(companyId, userId, tx, m.type, m.id);
        claimed.add(m.id);
        matched++;
      } catch { reviewed++; }
    } else if (highs.length > 1) {
      ambiguous++;
    } else if (!anyCandidate) {
      missing++;
    } else {
      reviewed++; // had medium candidates → leave for manual review
    }
  }

  return { matched, ambiguous, missing, reviewed };
}

/**
 * Apply a confirmed match: record the payment and flag the transaction
 * reconciled, atomically. Mirrors the per-transaction reconcile endpoint so
 * both paths behave identically (idempotent invoice payment on reference=tx.id).
 */
export async function applyMatch(
  companyId: string, userId: string | null, tx: typeof bankTransactions.$inferSelect,
  matchType: 'invoice' | 'expense', matchId: string,
): Promise<void> {
  if (tx.reconciled) return;
  const pay = Math.abs(tx.amountCents);

  if (matchType === 'invoice') {
    const [inv] = await db.select().from(transportInvoices)
      .where(and(eq(transportInvoices.id, matchId), eq(transportInvoices.companyId, companyId)));
    if (!inv) throw new Error('invoice-missing');
    if ((tx.currency || 'RON') !== (inv.currency || 'RON')) throw new Error('currency-mismatch');
    await db.transaction(async (t) => {
      await t.insert(transportInvoicePayments).values({
        id: nanoid(), invoiceId: matchId, amountCents: pay, currency: inv.currency || 'RON',
        method: 'transfer', reference: tx.id, receivedAt: new Date(), recordedByUserId: userId || null,
      } as any).onConflictDoNothing();
      const [{ s }] = await t.select({ s: sql<number>`COALESCE(SUM(${transportInvoicePayments.amountCents}), 0)` })
        .from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, matchId));
      const sumPaid = Math.min(Number(s) || 0, inv.totalCents);
      const fullyPaid = sumPaid >= inv.totalCents;
      await t.update(transportInvoices).set({
        paidCents: sumPaid, status: fullyPaid ? 'paid' : (sumPaid > 0 ? 'partial' : inv.status),
        paidAt: fullyPaid ? new Date() : inv.paidAt, updatedAt: new Date(),
      }).where(eq(transportInvoices.id, matchId));
      await t.update(bankTransactions).set({ reconciled: true, matchedType: 'invoice', matchedId: matchId })
        .where(eq(bankTransactions.id, tx.id));
    });
  } else {
    const [ex] = await db.select().from(expenses)
      .where(and(eq(expenses.id, matchId), eq(expenses.companyId, companyId)));
    if (!ex) throw new Error('expense-missing');
    const newPaid = Math.min((ex.paidCents || 0) + pay, ex.totalCents);
    const fullyPaid = newPaid >= ex.totalCents;
    await db.transaction(async (t) => {
      await t.update(expenses).set({
        paidCents: newPaid, status: fullyPaid ? 'paid' : 'partial', updatedAt: new Date(),
      }).where(eq(expenses.id, matchId));
      await t.update(bankTransactions).set({ reconciled: true, matchedType: 'expense', matchedId: matchId })
        .where(eq(bankTransactions.id, tx.id));
    });
  }
}
