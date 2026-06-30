// Cartea mare — the legal general-ledger register: every account that moved in
// the period as its own block (opening balance, each posting with running
// balance, period debit/credit totals, closing balance). Built from the existing
// trialBalance (openings + period totals) + journalRegister (the detail lines),
// so it reconciles with the balanță and per-account fișă.
import { trialBalance, journalRegister } from './accounting';

export interface CarteMareLine {
  date: string;
  entry: string;
  description: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number; // running, + debitor / − creditor
}
export interface CarteMareAccount {
  code: string;
  name: string;
  type: string;
  openingCents: number;
  periodDebitCents: number;
  periodCreditCents: number;
  closingCents: number;
  lines: CarteMareLine[];
}

export async function collectCarteMare(companyId: string, from: string, to: string): Promise<CarteMareAccount[]> {
  const [tb, jr] = await Promise.all([
    trialBalance(companyId, from, to).catch(() => []),
    journalRegister(companyId, from, to).catch(() => [] as any[]),
  ]);

  // Group posting lines by account code.
  const linesByAccount = new Map<string, CarteMareLine[]>();
  for (const e of jr) {
    for (const l of e.lines) {
      const arr = linesByAccount.get(l.accountCode) || [];
      arr.push({
        date: e.entryDate || '',
        entry: e.entryNumber || '',
        description: e.description || l.note || '',
        debitCents: l.debitCents || 0,
        creditCents: l.creditCents || 0,
        balanceCents: 0,
      });
      linesByAccount.set(l.accountCode, arr);
    }
  }

  const blocks: CarteMareAccount[] = [];
  for (const row of tb) {
    const hasMovement = row.periodDebit !== 0 || row.periodCredit !== 0 || row.openingDebit !== 0 || row.openingCredit !== 0;
    if (!hasMovement) continue;
    const opening = (row.openingDebit || 0) - (row.openingCredit || 0);
    const lines = (linesByAccount.get(row.code) || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let bal = opening;
    for (const ln of lines) { bal += ln.debitCents - ln.creditCents; ln.balanceCents = bal; }
    blocks.push({
      code: row.code,
      name: row.name,
      type: row.type,
      openingCents: opening,
      periodDebitCents: row.periodDebit || 0,
      periodCreditCents: row.periodCredit || 0,
      closingCents: (row.closingDebit || 0) - (row.closingCredit || 0),
      lines,
    });
  }
  blocks.sort((a, b) => a.code.localeCompare(b.code));
  return blocks;
}
