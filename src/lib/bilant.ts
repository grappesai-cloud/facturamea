// Simplified Romanian balance sheet (bilanț) + P&L (cont de profit și pierdere),
// derived deterministically from the trial balance (balanța de verificare).
//
// Grouping follows the RO chart-of-accounts classes:
//   1 capitaluri · 2 imobilizări · 3 stocuri · 4 terți · 5 trezorerie
//   6 cheltuieli · 7 venituri
//
// This is a management-grade bilanț (good enough to see the financial position
// and to hand to a review). The official ANAF annual forms (F1010/F2010) follow
// the same numbers but need their own XSD mapping — a later step, like D406.

import { trialBalance, type TrialBalanceRow } from './accounting';

export interface BilantLine { label: string; amountCents: number; accounts?: string[] }
export interface BilantResult {
  from: string;
  to: string;
  activ: { imobilizate: number; stocuri: number; creante: number; casaBanci: number; total: number; lines: BilantLine[] };
  pasiv: { capitaluri: number; datorii: number; total: number; lines: BilantLine[] };
  pnl: { venituri: number; cheltuieli: number; rezultat: number; lines: BilantLine[] };
  balanced: boolean;
}

const net = (r: TrialBalanceRow) => (r.closingDebit || 0) - (r.closingCredit || 0);
const cls = (code: string) => code.charAt(0);
// Activ accounts in class 4 (creanțe) vs datorii — by the account type from the chart.
const isActivType = (r: TrialBalanceRow) => r.type === 'A';

export async function buildBilant(companyId: string, year: number): Promise<BilantResult> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const rows = await trialBalance(companyId, from, to);

  let imobilizate = 0, stocuri = 0, creante = 0, casaBanci = 0;
  let capitaluri = 0, datorii = 0;
  let venituri = 0, cheltuieli = 0;
  const creanteAcc: string[] = [], datoriiAcc: string[] = [];

  for (const r of rows) {
    const c = cls(r.code);
    const n = net(r); // debit-positive
    if (c === '2') {
      imobilizate += n; // 20x/21x debit, 28x amortizare credit (subtracts) → net carrying value
    } else if (c === '3') {
      stocuri += n;
    } else if (c === '5') {
      if (r.code.startsWith('519')) { datorii += -n; datoriiAcc.push(r.code); }
      else casaBanci += n;
    } else if (c === '4') {
      if (isActivType(r) && n > 0) { creante += n; creanteAcc.push(r.code); }
      else { datorii += -n; datoriiAcc.push(r.code); } // P-type (401/421/431/444/4423…): credit balance
    } else if (c === '1') {
      capitaluri += -n; // capital/rezerve/rezultat reportat: credit balance
    } else if (c === '6') {
      cheltuieli += n;  // debit
    } else if (c === '7') {
      venituri += -n;   // credit
    }
  }

  const rezultat = venituri - cheltuieli; // profit (+) / pierdere (−) of the period
  capitaluri += rezultat; // rezultatul exercițiului intră în capitaluri proprii

  const totalActiv = imobilizate + stocuri + creante + casaBanci;
  const totalPasiv = capitaluri + datorii;

  return {
    from, to,
    activ: {
      imobilizate, stocuri, creante, casaBanci, total: totalActiv,
      lines: [
        { label: 'Active imobilizate (net)', amountCents: imobilizate },
        { label: 'Stocuri', amountCents: stocuri },
        { label: 'Creanțe (clienți, TVA de recuperat)', amountCents: creante, accounts: creanteAcc },
        { label: 'Casa și conturi la bănci', amountCents: casaBanci },
      ],
    },
    pasiv: {
      capitaluri, datorii, total: totalPasiv,
      lines: [
        { label: 'Capitaluri proprii (incl. rezultatul exercițiului)', amountCents: capitaluri },
        { label: 'Datorii (furnizori, salarii, taxe, TVA de plată)', amountCents: datorii, accounts: datoriiAcc },
      ],
    },
    pnl: {
      venituri, cheltuieli, rezultat,
      lines: [
        { label: 'Venituri totale', amountCents: venituri },
        { label: 'Cheltuieli totale', amountCents: cheltuieli },
        { label: rezultat >= 0 ? 'Profit' : 'Pierdere', amountCents: rezultat },
      ],
    },
    // A small rounding tolerance; large gaps mean unbalanced postings to review.
    balanced: Math.abs(totalActiv - totalPasiv) <= 100,
  };
}
