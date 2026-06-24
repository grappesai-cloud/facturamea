import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { bankTransactions, transportInvoices, expenses, transportInvoicePayments } from '../../../../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { requireRole } from '../../../../lib/require-role';
const ron = (cents: number) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format((cents || 0) / 100);

interface Suggestion {
  type: 'invoice' | 'expense';
  id: string;
  number: string;
  party: string;
  outstandingCents: number;
  totalCents: number;
  amountLabel: string;
  reason: 'exact' | 'number';   // why it was suggested
}

// Normalize a string for loose "number appears in text" matching.
function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[\s.\-/]+/g, '');
}

// ──────────────────────────────────────────────────────────────────────────
// GET — return the transaction + suggested matches.
// ──────────────────────────────────────────────────────────────────────────
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });

  try {
    const [tx] = await db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.companyId, cid)));
    if (!tx) return new Response(JSON.stringify({ error: 'Tranzacție inexistentă' }), { status: 404 });

    const suggestions: Suggestion[] = [];
    const amount = tx.amountCents;
    const haystack = norm(`${tx.description || ''} ${tx.reference || ''}`);

    if (amount > 0) {
      // Incoming money -> match against unpaid issued invoices (kind='factura').
      const invoices = await db.select().from(transportInvoices)
        .where(and(
          eq(transportInvoices.companyId, cid),
          eq(transportInvoices.kind, 'factura'),
          inArray(transportInvoices.status, ['issued', 'sent', 'partial', 'overdue']),
        ))
        .orderBy(sql`${transportInvoices.dueAt} ASC NULLS LAST`)
        .limit(500);

      for (const inv of invoices) {
        const outstanding = (inv.totalCents || 0) - (inv.paidCents || 0);
        if (outstanding <= 0) continue;
        const exact = outstanding === amount;
        const byNumber = !!inv.fullNumber && haystack.includes(norm(inv.fullNumber));
        if (!exact && !byNumber) continue;
        suggestions.push({
          type: 'invoice', id: inv.id, number: inv.fullNumber, party: inv.clientNameSnap,
          outstandingCents: outstanding, totalCents: inv.totalCents, amountLabel: ron(outstanding),
          reason: exact ? 'exact' : 'number',
        });
      }
    } else if (amount < 0) {
      // Outgoing money -> match against unpaid expenses.
      const target = Math.abs(amount);
      const exps = await db.select().from(expenses)
        .where(and(
          eq(expenses.companyId, cid),
          inArray(expenses.status, ['unpaid', 'partial']),
        ))
        .limit(500);

      for (const ex of exps) {
        const outstanding = (ex.totalCents || 0) - (ex.paidCents || 0);
        if (outstanding <= 0) continue;
        const exact = outstanding === target;
        const byNumber = !!ex.documentNumber && haystack.includes(norm(ex.documentNumber));
        if (!exact && !byNumber) continue;
        suggestions.push({
          type: 'expense', id: ex.id, number: ex.documentNumber || '(fără număr)',
          party: ex.supplierNameSnap || '(furnizor necunoscut)',
          outstandingCents: outstanding, totalCents: ex.totalCents, amountLabel: ron(outstanding),
          reason: exact ? 'exact' : 'number',
        });
      }
    }

    // Exact-amount matches first, then number matches; cap to a sane number.
    suggestions.sort((a, b) => (a.reason === b.reason ? 0 : a.reason === 'exact' ? -1 : 1));
    const top = suggestions.slice(0, 20);

    return new Response(JSON.stringify({ transaction: tx, suggestions: top }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ transaction: null, suggestions: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// POST — reconcile: link the transaction to an invoice/expense and apply payment.
// body: { matchType: 'invoice' | 'expense', matchId: string }
// ──────────────────────────────────────────────────────────────────────────
export const POST: APIRoute = async ({ params, request, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const matchType = body.matchType === 'expense' ? 'expense' : body.matchType === 'invoice' ? 'invoice' : null;
  const matchId = String(body.matchId || '');
  if (!matchType || !matchId) return new Response(JSON.stringify({ error: 'Date de potrivire lipsă' }), { status: 400 });

  try {
    const [tx] = await db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.companyId, cid)));
    if (!tx) return new Response(JSON.stringify({ error: 'Tranzacție inexistentă' }), { status: 404 });
    if (tx.reconciled) return new Response(JSON.stringify({ error: 'Tranzacția este deja reconciliată' }), { status: 409 });

    const pay = Math.abs(tx.amountCents);

    // Resolve + validate the target first, then apply the payment AND the
    // reconciled flag atomically — so a failure can't leave the money applied
    // while the transaction stays re-matchable (double-apply).
    let applyPayment: (tx: any) => Promise<void>;
    if (matchType === 'invoice') {
      const [inv] = await db.select().from(transportInvoices)
        .where(and(eq(transportInvoices.id, matchId), eq(transportInvoices.companyId, cid)));
      if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });
      // Don't record a payment in the wrong currency: paidCents is tracked in the
      // invoice currency. On a mismatch, require a manual entry with the exact amount.
      if ((tx.currency || 'RON') !== (inv.currency || 'RON')) {
        return new Response(JSON.stringify({ error: `Moneda tranzacției (${tx.currency || 'RON'}) diferă de moneda facturii (${inv.currency || 'RON'}). Înregistrează plata manual, cu suma exactă în moneda facturii.` }), { status: 422, headers: { 'Content-Type': 'application/json' } });
      }
      applyPayment = async (t) => {
        // Record a real payment row (idempotent on invoice+reference via the
        // unique index, reference = bank-tx id), then recompute paidCents from the
        // SUM — so a later manual payment recompute can't erase this money.
        await t.insert(transportInvoicePayments).values({
          id: nanoid(), invoiceId: matchId, amountCents: pay, currency: inv.currency || 'RON',
          method: 'transfer', reference: id, receivedAt: new Date(),
          recordedByUserId: locals.user?.id || null,
        } as any).onConflictDoNothing();
        const [{ s }] = await t.select({ s: sql<number>`COALESCE(SUM(${transportInvoicePayments.amountCents}), 0)` })
          .from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, matchId));
        const sumPaid = Math.min(Number(s) || 0, inv.totalCents);
        const fullyPaid = sumPaid >= inv.totalCents;
        await t.update(transportInvoices).set({
          paidCents: sumPaid, status: fullyPaid ? 'paid' : (sumPaid > 0 ? 'partial' : inv.status),
          paidAt: fullyPaid ? new Date() : inv.paidAt, updatedAt: new Date(),
        }).where(eq(transportInvoices.id, matchId));
      };
    } else {
      const [ex] = await db.select().from(expenses)
        .where(and(eq(expenses.id, matchId), eq(expenses.companyId, cid)));
      if (!ex) return new Response(JSON.stringify({ error: 'Cheltuială inexistentă' }), { status: 404 });
      const newPaid = Math.min((ex.paidCents || 0) + pay, ex.totalCents);
      const fullyPaid = newPaid >= ex.totalCents;
      applyPayment = (t) => t.update(expenses).set({
        paidCents: newPaid, status: fullyPaid ? 'paid' : 'partial', updatedAt: new Date(),
      }).where(eq(expenses.id, matchId));
    }

    await db.transaction(async (t) => {
      await applyPayment(t);
      await t.update(bankTransactions).set({
        reconciled: true, matchedType: matchType, matchedId: matchId,
      }).where(eq(bankTransactions.id, id));
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Reconcilierea a eșuat. Verifică baza de date.' }), { status: 500 });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// PATCH — undo a reconciliation: clear match flags and roll back the payment.
// body: { reconciled: false }
// ──────────────────────────────────────────────────────────────────────────
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (body.reconciled !== false) return new Response(JSON.stringify({ error: 'Doar anularea reconcilierii este permisă' }), { status: 400 });

  try {
    const [tx] = await db.select().from(bankTransactions)
      .where(and(eq(bankTransactions.id, id), eq(bankTransactions.companyId, cid)));
    if (!tx) return new Response(JSON.stringify({ error: 'Tranzacție inexistentă' }), { status: 404 });
    if (!tx.reconciled) return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });

    const refund = Math.abs(tx.amountCents);

    if (tx.matchedType === 'invoice' && tx.matchedId) {
      const [inv] = await db.select().from(transportInvoices)
        .where(and(eq(transportInvoices.id, tx.matchedId), eq(transportInvoices.companyId, cid)));
      if (inv) {
        await db.transaction(async (t) => {
          // Remove the payment row this reconciliation created, then recompute.
          await t.delete(transportInvoicePayments).where(and(eq(transportInvoicePayments.invoiceId, tx.matchedId!), eq(transportInvoicePayments.reference, id)));
          const [{ s }] = await t.select({ s: sql<number>`COALESCE(SUM(${transportInvoicePayments.amountCents}), 0)` })
            .from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, tx.matchedId!));
          const sumPaid = Math.min(Number(s) || 0, inv.totalCents);
          const status = sumPaid <= 0 ? 'issued' : sumPaid >= inv.totalCents ? 'paid' : 'partial';
          await t.update(transportInvoices).set({
            paidCents: sumPaid, status,
            paidAt: sumPaid >= inv.totalCents ? inv.paidAt : null, updatedAt: new Date(),
          }).where(eq(transportInvoices.id, tx.matchedId!));
        });
      }
    } else if (tx.matchedType === 'expense' && tx.matchedId) {
      const [ex] = await db.select().from(expenses)
        .where(and(eq(expenses.id, tx.matchedId), eq(expenses.companyId, cid)));
      if (ex) {
        const newPaid = Math.max((ex.paidCents || 0) - refund, 0);
        const status = newPaid <= 0 ? 'unpaid' : newPaid >= ex.totalCents ? 'paid' : 'partial';
        await db.update(expenses).set({ paidCents: newPaid, status, updatedAt: new Date() })
          .where(eq(expenses.id, tx.matchedId));
      }
    }

    await db.update(bankTransactions).set({ reconciled: false, matchedType: null, matchedId: null })
      .where(eq(bankTransactions.id, id));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Anularea a eșuat' }), { status: 500 });
  }
};
