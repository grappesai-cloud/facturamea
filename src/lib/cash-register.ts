// Registru de casă — chronological cash-movement register with running balance.
// Cash IN comes from POS cash sales + invoice cash receipts (chitanțe, method=
// 'cash'); cash IN/OUT also from manual entries on any account named "Casă" /
// "Numerar" (where cash purchases, withdrawals etc. are booked). The three
// sources are disjoint in practice, so no double counting. RON only (cash is RON).
import { db } from '../db';
import { posSales, transportInvoicePayments, transportInvoices, bankAccounts, bankTransactions } from '../db/schema';
import { and, eq, lte, inArray } from 'drizzle-orm';

export interface CashRow {
  date: string;        // YYYY-MM-DD
  ts: number;          // sort key
  source: 'POS' | 'Chitanță' | 'Casă';
  doc: string;
  explanation: string;
  inCents: number;
  outCents: number;
  balanceCents: number; // running, filled after sort
}
export interface CashRegister {
  from: string; to: string;
  openingCents: number;
  rows: CashRow[];
  totalsInCents: number;
  totalsOutCents: number;
  closingCents: number;
}

const ymd = (d: Date | string | null): string => {
  if (!d) return '';
  const s = d instanceof Date ? d.toISOString() : String(d);
  return s.slice(0, 10);
};

export async function collectCashRegister(companyId: string, from: string, to: string): Promise<CashRegister> {
  const toEnd = new Date(to + 'T23:59:59Z');
  const all: CashRow[] = [];

  // 1) POS cash sales (paymentMethod cash or the cash leg of a mixed sale).
  try {
    const sales = await db.select().from(posSales).where(and(
      eq(posSales.companyId, companyId),
      lte(posSales.createdAt, toEnd),
    ));
    for (const s of sales) {
      if (s.paymentMethod === 'card') continue;
      const cash = s.paymentMethod === 'mixed'
        ? Math.max(0, (s.cashReceivedCents || 0) - (s.changeCents || 0))
        : (s.totalCents || 0);
      if (cash <= 0) continue;
      const d = s.createdAt as Date;
      all.push({ date: ymd(d), ts: Number(new Date(d)), source: 'POS', doc: s.receiptNumber || '', explanation: 'Vânzare POS', inCents: cash, outCents: 0, balanceCents: 0 });
    }
  } catch { /* skip */ }

  // 2) Invoice cash receipts (chitanțe). Join invoices to filter by company.
  try {
    const invs = await db.select({ id: transportInvoices.id, num: transportInvoices.fullNumber, client: transportInvoices.clientNameSnap })
      .from(transportInvoices).where(eq(transportInvoices.companyId, companyId));
    const invMap = new Map(invs.map((i) => [i.id, i]));
    if (invMap.size) {
      const pays = await db.select().from(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, [...invMap.keys()]));
      for (const p of pays) {
        if (p.method !== 'cash') continue;
        const d = p.receivedAt as Date;
        if (Number(new Date(d)) > Number(toEnd)) continue;
        const inv = invMap.get(p.invoiceId);
        all.push({ date: ymd(d), ts: Number(new Date(d)), source: 'Chitanță', doc: inv?.num || '', explanation: `Încasare ${inv?.num || 'factură'}${inv?.client ? ' · ' + inv.client : ''}`, inCents: p.amountCents || 0, outCents: 0, balanceCents: 0 });
      }
    }
  } catch { /* skip */ }

  // 3) Manual cash account movements (accounts named Casă / Numerar).
  try {
    const accts = await db.select().from(bankAccounts).where(eq(bankAccounts.companyId, companyId));
    const cashIds = accts.filter((a) => /cas[aă]|numerar/i.test(a.name || '')).map((a) => a.id);
    if (cashIds.length) {
      const txs = await db.select().from(bankTransactions).where(inArray(bankTransactions.accountId, cashIds));
      for (const t of txs) {
        const d = ymd(t.bookingDate);
        if (!d || d > to) continue;
        const amt = t.amountCents || 0;
        all.push({ date: d, ts: Number(new Date(d + 'T12:00:00Z')), source: 'Casă', doc: t.reference || '', explanation: [t.description, t.counterparty].filter(Boolean).join(' · ') || 'Mișcare casă', inCents: amt > 0 ? amt : 0, outCents: amt < 0 ? -amt : 0, balanceCents: 0 });
      }
    }
  } catch { /* skip */ }

  // Opening = net of everything strictly before `from`; period rows are the rest.
  let openingCents = 0;
  const rows: CashRow[] = [];
  for (const r of all) {
    if (r.date < from) openingCents += r.inCents - r.outCents;
    else rows.push(r);
  }
  rows.sort((a, b) => a.ts - b.ts);

  let bal = openingCents;
  let totalsIn = 0; let totalsOut = 0;
  for (const r of rows) {
    bal += r.inCents - r.outCents;
    r.balanceCents = bal;
    totalsIn += r.inCents; totalsOut += r.outCents;
  }

  return { from, to, openingCents, rows, totalsInCents: totalsIn, totalsOutCents: totalsOut, closingCents: bal };
}
