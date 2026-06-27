// Double-entry accounting engine for facturamea (contabilitate în partidă dublă).
//
// All money is stored as INTEGER cents. Every journal entry (notă contabilă) is
// balanced: sum(debit) === sum(credit). Source documents (facturi, cheltuieli,
// încasări) can be auto-posted into balanced entries.
//
// NOTE: no DB is connected locally, so every public function wraps its queries
// in try/catch and degrades gracefully (mirrors src/pages/app/index.astro).

import { db } from '../db';
import {
  ledgerAccounts,
  journalEntries,
  journalLines,
  transportInvoices,
  transportInvoiceLines,
  transportInvoicePayments,
  expenses,
  companies,
} from '../db/schema';

// Units that mark a line as a service (→ revenue account 704 instead of 707).
const SERVICE_UNITS = new Set(['serviciu', 'oră', 'ora', 'ore', 'abonament', 'lună', 'luna', 'zi', 'an', 'cursă', 'cursa', 'h', 'HUR']);
import { and, eq, gte, lte, asc, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { invoiceRonCents } from './invoicing';

// ─── Types ───────────────────────────────────────────────────────────────
// Account type, Romanian style: A=Activ, P=Pasiv, B=Bifuncțional, V=Venit, C=Cheltuială.
export type AccountType = 'A' | 'P' | 'B' | 'V' | 'C';

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string | null;
}

export interface PostLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  note?: string | null;
}

export interface PostEntryInput {
  entryDate: string; // YYYY-MM-DD
  description?: string | null;
  source?: 'manual' | 'invoice' | 'expense' | 'payment' | 'bank' | 'depreciation';
  refType?: string | null;
  refId?: string | null;
  lines: PostLine[];
  createdByUserId?: string | null;
}

export interface PostResult {
  ok: boolean;
  entryId?: string;
  entryNumber?: string;
  skipped?: boolean; // already posted (idempotent on refType+refId)
  error?: string;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface LedgerLine {
  entryId: string;
  entryNumber: string | null;
  entryDate: string | null;
  description: string | null;
  debitCents: number;
  creditCents: number;
  note: string | null;
  runningBalance: number; // signed; >0 = debitor, <0 = creditor
}

// ─── Romanian minimal chart of accounts ────────────────────────────────────
// A pragmatic subset of the planul de conturi general, enough to post sales,
// purchases, payments, salaries, taxes and a handful of common expenses.
export const RO_CHART: ChartAccount[] = [
  // Clasa 1 — Capitaluri
  { code: '1012', name: 'Capital subscris vărsat', type: 'P' },
  { code: '117', name: 'Rezultatul reportat', type: 'B' },
  { code: '121', name: 'Profit sau pierdere', type: 'B' },
  { code: '129', name: 'Repartizarea profitului', type: 'A' },

  // Clasa 2 — Imobilizări
  { code: '2131', name: 'Echipamente tehnologice', type: 'A' },
  { code: '214', name: 'Mobilier și aparatură birotică', type: 'A' },
  { code: '2813', name: 'Amortizarea echipamentelor', type: 'P', parentCode: '281' },
  { code: '281', name: 'Amortizări imobilizări corporale', type: 'P' },

  // Clasa 3 — Stocuri
  { code: '301', name: 'Materii prime', type: 'A' },
  { code: '371', name: 'Mărfuri', type: 'A' },
  { code: '378', name: 'Diferențe de preț la mărfuri', type: 'B' },

  // Clasa 4 — Terți
  { code: '401', name: 'Furnizori', type: 'P' },
  { code: '404', name: 'Furnizori de imobilizări', type: 'P' },
  { code: '411', name: 'Clienți', type: 'A' },
  { code: '4111', name: 'Clienți', type: 'A', parentCode: '411' },
  { code: '4118', name: 'Clienți incerți sau în litigiu', type: 'A', parentCode: '411' },
  { code: '419', name: 'Clienți creditori (avansuri)', type: 'P' },
  { code: '421', name: 'Personal, salarii datorate', type: 'P' },
  { code: '4423', name: 'TVA de plată', type: 'P' },
  { code: '4424', name: 'TVA de recuperat', type: 'A' },
  { code: '4426', name: 'TVA deductibilă', type: 'A' },
  { code: '4427', name: 'TVA colectată', type: 'P' },
  { code: '4428', name: 'TVA neexigibilă', type: 'B' },
  { code: '444', name: 'Impozitul pe venituri de natura salariilor', type: 'P' },
  { code: '446', name: 'Alte impozite, taxe și vărsăminte', type: 'P' },
  { code: '462', name: 'Creditori diverși', type: 'P' },
  { code: '473', name: 'Decontări din operațiuni în curs', type: 'B' },

  // Clasa 5 — Trezorerie
  { code: '5121', name: 'Conturi la bănci în lei', type: 'A' },
  { code: '5124', name: 'Conturi la bănci în valută', type: 'A' },
  { code: '5311', name: 'Casa în lei', type: 'A' },
  { code: '5314', name: 'Casa în valută', type: 'A' },
  { code: '581', name: 'Viramente interne', type: 'B' },

  // Clasa 6 — Cheltuieli
  { code: '601', name: 'Cheltuieli cu materiile prime', type: 'C' },
  { code: '602', name: 'Cheltuieli cu materialele consumabile', type: 'C' },
  { code: '605', name: 'Cheltuieli cu energia și apa', type: 'C' },
  { code: '607', name: 'Cheltuieli privind mărfurile', type: 'C' },
  { code: '611', name: 'Cheltuieli cu întreținerea și reparațiile', type: 'C' },
  { code: '612', name: 'Cheltuieli cu redevențe și chirii', type: 'C' },
  { code: '622', name: 'Cheltuieli cu comisioane și onorarii', type: 'C' },
  { code: '624', name: 'Cheltuieli cu transportul', type: 'C' },
  { code: '627', name: 'Cheltuieli cu servicii bancare', type: 'C' },
  { code: '628', name: 'Alte cheltuieli cu serviciile executate de terți', type: 'C' },
  { code: '635', name: 'Cheltuieli cu alte impozite, taxe', type: 'C' },
  { code: '641', name: 'Cheltuieli cu salariile personalului', type: 'C' },
  { code: '6581', name: 'Despăgubiri, amenzi și penalități', type: 'C' },
  { code: '665', name: 'Cheltuieli din diferențe de curs valutar', type: 'C' },
  { code: '6811', name: 'Cheltuieli de exploatare privind amortizarea', type: 'C' },

  // Clasa 7 — Venituri
  { code: '701', name: 'Venituri din vânzarea produselor finite', type: 'V' },
  { code: '704', name: 'Venituri din servicii prestate', type: 'V' },
  { code: '707', name: 'Venituri din vânzarea mărfurilor', type: 'V' },
  { code: '708', name: 'Venituri din activități diverse', type: 'V' },
  { code: '758', name: 'Alte venituri din exploatare', type: 'V' },
  { code: '765', name: 'Venituri din diferențe de curs valutar', type: 'V' },
  { code: '766', name: 'Venituri din dobânzi', type: 'V' },
];

// Deduplicate by code (the chart above intentionally tolerates accidental dupes).
function uniqueChart(): ChartAccount[] {
  const seen = new Set<string>();
  const out: ChartAccount[] = [];
  for (const a of RO_CHART) {
    if (seen.has(a.code)) continue;
    seen.add(a.code);
    out.push(a);
  }
  return out;
}

// ─── Helpers ────────────────────────────────────────────────────────────
function centsOf(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Chart bootstrap ──────────────────────────────────────────────────────
export async function ensureChart(companyId: string): Promise<{ created: number }> {
  if (!companyId) return { created: 0 };
  try {
    const existing = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.companyId, companyId))
      .limit(1);
    if (existing.length > 0) return { created: 0 };

    const rows = uniqueChart().map((a) => ({
      id: nanoid(),
      companyId,
      code: a.code,
      name: a.name,
      type: a.type,
      parentCode: a.parentCode ?? null,
      isActive: true,
    }));
    await db.insert(ledgerAccounts).values(rows);
    return { created: rows.length };
  } catch {
    return { created: 0 };
  }
}

export async function hasChart(companyId: string): Promise<boolean> {
  if (!companyId) return false;
  try {
    const rows = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.companyId, companyId))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function listAccounts(companyId: string) {
  if (!companyId) return [];
  try {
    return await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.companyId, companyId))
      .orderBy(asc(ledgerAccounts.code));
  } catch {
    return [];
  }
}

// ─── Core posting ───────────────────────────────────────────────────────
// Validates that the entry balances, allocates a per-company sequential number,
// then inserts the entry + lines. Idempotent on (refType, refId): if an entry
// already exists for that pair, it is skipped.
export async function postEntry(companyId: string, input: PostEntryInput): Promise<PostResult> {
  if (!companyId) return { ok: false, error: 'Companie lipsă' };

  // Period lock: refuse any ledger entry dated within a closed (locked) period.
  if (input.entryDate) {
    try {
      const [co] = await db.select({ locked: companies.ledgerLockedUntil }).from(companies).where(eq(companies.id, companyId)).limit(1);
      if (co?.locked && input.entryDate <= co.locked) {
        return { ok: false, error: `Perioada este închisă (blocată până la ${co.locked}). Deblochează luna pentru a posta în ea.` };
      }
    } catch { /* if the check fails, fall through — don't block legitimate posting on a read error */ }
  }

  const lines = (input.lines || [])
    .map((l) => {
      // A reversal (storno) arrives as negative debit/credit. Proper double-entry
      // has no negative sides: flip a negative debit into a positive credit and
      // vice versa, so the entry posts as a correct contra-entry (and never trips
      // a non-negative DB constraint).
      let d = centsOf(l.debitCents);
      let c = centsOf(l.creditCents);
      if (d < 0) { c += -d; d = 0; }
      if (c < 0) { d += -c; c = 0; }
      return { accountCode: String(l.accountCode || '').trim(), debitCents: d, creditCents: c, note: l.note?.toString().trim() || null };
    })
    .filter((l) => l.accountCode && (l.debitCents !== 0 || l.creditCents !== 0));

  if (lines.length < 2) return { ok: false, error: 'O notă contabilă are nevoie de cel puțin două rânduri.' };

  const totalDebit = lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditCents, 0);
  if (totalDebit !== totalCredit) {
    return { ok: false, error: `Nota nu este echilibrată: debit ${(totalDebit / 100).toFixed(2)} ≠ credit ${(totalCredit / 100).toFixed(2)}.` };
  }
  if (totalDebit === 0) return { ok: false, error: 'Sumele nu pot fi zero.' };

  try {
    // Idempotency guard on (refType, refId).
    if (input.refType && input.refId) {
      const dup = await db
        .select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.companyId, companyId),
          eq(journalEntries.refType, input.refType),
          eq(journalEntries.refId, input.refId),
        ))
        .limit(1);
      if (dup.length > 0) {
        return { ok: true, skipped: true, entryId: dup[0].id, entryNumber: dup[0].entryNumber ?? undefined };
      }
    }

    // Sequential entry number per company. COUNT(*)+1 races under concurrency
    // (two posters read the same count and mint the same NC-xxxxx). We instead
    // derive the next number from the current MAX suffix and retry on a unique
    // (company_id, entry_number) violation. This requires the unique constraint
    // `journal_entries_company_entry_number_uq` on (company_id, entry_number)
    // — the schema agent adds it; the retry loop is correct with or without it
    // (without it, the loop still narrows the window dramatically).
    const entryId = nanoid();
    const MAX_ATTEMPTS = 8;
    let lastErr: any = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Highest existing NC suffix for this company.
      const [maxRow] = await db
        .select({ m: sql<number>`COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(${journalEntries.entryNumber}, '\\D', '', 'g'), '') AS INTEGER)), 0)` })
        .from(journalEntries)
        .where(eq(journalEntries.companyId, companyId));
      const seq = Number(maxRow?.m ?? 0) + 1 + attempt;
      const entryNumber = `NC-${String(seq).padStart(5, '0')}`;

      try {
        await db.transaction(async (tx) => {
          await tx.insert(journalEntries).values({
            id: entryId,
            companyId,
            entryNumber,
            entryDate: input.entryDate || todayISO(),
            description: input.description?.toString().trim() || null,
            source: input.source || 'manual',
            refType: input.refType || null,
            refId: input.refId || null,
            totalDebitCents: totalDebit,
            totalCreditCents: totalCredit,
            posted: true,
            createdByUserId: input.createdByUserId || null,
          });
          await tx.insert(journalLines).values(
            lines.map((l) => ({
              id: nanoid(),
              entryId,
              companyId,
              accountCode: l.accountCode,
              debitCents: l.debitCents,
              creditCents: l.creditCents,
              note: l.note,
            })),
          );
        });
        return { ok: true, entryId, entryNumber };
      } catch (err: any) {
        lastErr = err;
        if (err?.code === '23505') {
          // Could be the ref-unique index (a concurrent post of the SAME document):
          // if the entry now exists, return an idempotent skip instead of futilely
          // retrying the number against an unchanged ref. Otherwise it's an
          // entry-number collision → retry with the next number.
          if (input.refType && input.refId) {
            const [exists] = await db
              .select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber })
              .from(journalEntries)
              .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.refType, input.refType), eq(journalEntries.refId, input.refId)))
              .limit(1);
            if (exists) return { ok: true, skipped: true, entryId: exists.id, entryNumber: exists.entryNumber ?? undefined };
          }
          continue;
        }
        throw err;
      }
    }
    return { ok: false, error: lastErr?.message || 'Nu am putut aloca un număr de notă contabilă (conflict de numerotare).' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Eroare la salvarea notei contabile.' };
  }
}

// ─── Auto-post from source documents ──────────────────────────────────────
// Sales invoice: debit 4111 total · credit 707 net · credit 4427 vat.
export async function postInvoice(invoiceId: string, createdByUserId?: string | null): Promise<PostResult> {
  if (!invoiceId) return { ok: false, error: 'ID factură lipsă' };
  try {
    const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
    if (!inv) return { ok: false, error: 'Factura nu există.' };
    if (inv.kind !== 'factura' && inv.kind !== 'storno') {
      return { ok: false, skipped: true, error: 'Doar facturile fiscale se contează.' };
    }

    await ensureChart(inv.companyId);

    // The ledger is kept in RON: a foreign-currency invoice posts its RON value
    // (frozen at issue / converted at the BNR rate), never the raw currency cents.
    const ron = invoiceRonCents(inv);
    const net = ron.subtotal;
    const vat = ron.vat;
    const total = ron.total;

    // Revenue account: 704 (servicii) when every line is service-like by unit,
    // otherwise 707 (mărfuri). The accountant can reclassify if needed.
    let revenueAccount = '707';
    try {
      const ls = await db.select({ unit: transportInvoiceLines.unit }).from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, inv.id));
      if (ls.length > 0 && ls.every((l) => SERVICE_UNITS.has(String(l.unit || '').toLowerCase()))) revenueAccount = '704';
    } catch { /* keep 707 on any read issue */ }
    const desc = `Factura ${inv.fullNumber} · ${inv.clientNameSnap}`;

    const lines: PostLine[] = [
      { accountCode: '4111', debitCents: total, creditCents: 0, note: 'Total factură' },
      { accountCode: revenueAccount, debitCents: 0, creditCents: net, note: 'Venit net' },
    ];
    if (vat !== 0) {
      // !== 0 (not > 0) so a storno's negative VAT line is also posted, else the
      // reversal entry is unbalanced (missing the 4427 contra-line).
      // TVA la încasare: at issue the VAT is not yet chargeable, so it credits
      // 4428 (TVA neexigibilă) instead of 4427 (TVA colectată). It is reclassed
      // to 4427 proportionally as the invoice gets paid (see postPayment).
      const cashVat = !!inv.vatAtCollection || inv.vatRegime === 'tva_la_incasare';
      lines.push({
        accountCode: cashVat ? '4428' : '4427',
        debitCents: 0,
        creditCents: vat,
        note: cashVat ? 'TVA neexigibilă (la încasare)' : 'TVA colectată',
      });
    }

    return await postEntry(inv.companyId, {
      entryDate: (inv.bnrRateDate || (inv.issuedAt ? new Date(inv.issuedAt).toISOString().slice(0, 10) : todayISO())),
      description: desc,
      source: 'invoice',
      refType: 'invoice',
      refId: inv.id,
      lines,
      createdByUserId,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Eroare la contarea facturii.' };
  }
}

// Expense / purchase invoice: debit 6xx net + debit 4426 vat · credit 401 total.
export async function postExpense(expenseId: string, createdByUserId?: string | null): Promise<PostResult> {
  if (!expenseId) return { ok: false, error: 'ID cheltuială lipsă' };
  try {
    const [exp] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    if (!exp) return { ok: false, error: 'Cheltuiala nu există.' };

    await ensureChart(exp.companyId);

    const net = centsOf(exp.netCents);
    const vat = centsOf(exp.vatCents);
    const total = centsOf(exp.totalCents);

    const expenseAccount = expenseAccountForCategory(exp.category);
    const desc = `Cheltuială ${exp.documentNumber || ''} · ${exp.supplierNameSnap || 'furnizor'}`.trim();

    const reverseCharge = (exp as any).vatScheme === 'reverse_charge';

    const lines: PostLine[] = [
      { accountCode: expenseAccount, debitCents: net, creditCents: 0, note: 'Cheltuială netă' },
    ];
    if (vat > 0) {
      if (reverseCharge) {
        // Taxare inversă (achiziții intra-UE / servicii non-UE): TVA-ul se
        // auto-lichidează — deductibilă (4426) ȘI colectată (4427) simultan,
        // efect net zero. Nu se datorează furnizorului (401 = doar netul).
        lines.push({ accountCode: '4426', debitCents: vat, creditCents: 0, note: 'TVA deductibilă (taxare inversă)' });
        lines.push({ accountCode: '4427', debitCents: 0, creditCents: vat, note: 'TVA colectată (taxare inversă)' });
      } else {
        // Partial VAT deductibility (e.g. 50% for a company car not used
        // exclusively for business): only the deductible share hits 4426; the
        // non-deductible VAT folds into the expense account (it's a real cost).
        const rawPct = (exp as any).deductiblePct;
        const pct = Math.max(0, Math.min(100, rawPct == null ? (exp.deductible ? 100 : 0) : Number(rawPct)));
        const dedVat = Math.round((vat * pct) / 100);
        const nonDedVat = vat - dedVat;
        if (dedVat > 0) lines.push({ accountCode: '4426', debitCents: dedVat, creditCents: 0, note: pct < 100 ? `TVA deductibilă ${pct}%` : 'TVA deductibilă' });
        if (nonDedVat > 0) lines[0].debitCents += nonDedVat;
      }
    }
    // Supplier payable: under reverse charge the VAT isn't owed to the supplier,
    // only the net. Otherwise the full document total.
    const payable = reverseCharge ? net : total;
    lines.push({ accountCode: '401', debitCents: 0, creditCents: payable, note: 'Datorie furnizor' });

    return await postEntry(exp.companyId, {
      entryDate: exp.issueDate || todayISO(),
      description: desc,
      source: 'expense',
      refType: 'expense',
      refId: exp.id,
      lines,
      createdByUserId,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Eroare la contarea cheltuielii.' };
  }
}

// Payment / receipt against a sales invoice: debit 5121 (or 5311 cash) · credit 4111.
export async function postPayment(paymentId: string, createdByUserId?: string | null): Promise<PostResult> {
  if (!paymentId) return { ok: false, error: 'ID încasare lipsă' };
  try {
    const [pay] = await db.select().from(transportInvoicePayments).where(eq(transportInvoicePayments.id, paymentId)).limit(1);
    if (!pay) return { ok: false, error: 'Încasarea nu există.' };

    const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, pay.invoiceId)).limit(1);
    if (!inv) return { ok: false, error: 'Factura asociată nu există.' };

    await ensureChart(inv.companyId);

    // The ledger is in RON: convert a foreign-currency payment at the invoice's
    // frozen BNR rate so 4111 clears against the RON amount postInvoice debited.
    const payCents = centsOf(pay.amountCents); // invoice currency
    if (payCents <= 0) return { ok: false, error: 'Sumă încasare invalidă.' };
    const fxRate = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    const amount = Math.round(payCents * fxRate); // RON

    // Cash methods land in Casa (5311); everything else in bancă (5121).
    const cashAccount = pay.method === 'cash' ? '5311' : '5121';
    const desc = `Încasare factura ${inv.fullNumber}${pay.reference ? ` · ${pay.reference}` : ''}`;

    const lines: PostLine[] = [
      { accountCode: cashAccount, debitCents: amount, creditCents: 0, note: cashAccount === '5311' ? 'Casa' : 'Bancă' },
      { accountCode: '4111', debitCents: 0, creditCents: amount, note: 'Stingere creanță client' },
    ];

    // TVA la încasare: as the invoice is collected, the VAT portion of THIS
    // payment becomes chargeable → reclass it from 4428 (neexigibilă) to 4427
    // (colectată). This is an extra balanced pair (debit 4428 / credit 4427),
    // independent of the cash/411 stinging above, so the entry stays balanced.
    const cashVat = !!inv.vatAtCollection || inv.vatRegime === 'tva_la_incasare';
    const total = centsOf(inv.totalCents);      // invoice currency (used only for the ratio, which cancels)
    const vatRon = invoiceRonCents(inv).vat;    // RON VAT — the reclass amount is in RON
    if (cashVat && vatRon > 0 && total > 0) {
      // Proportional VAT in this payment (ratio in invoice currency, amount in RON),
      // capped so cumulative reclass never exceeds the invoice's RON VAT.
      const paidBefore = centsOf((inv as any).paidCents) - payCents;
      const reclassedBefore = Math.round((Math.max(0, paidBefore) * vatRon) / total);
      const reclassedToDate = Math.min(vatRon, Math.round((Math.max(0, paidBefore) + payCents) * vatRon / total));
      const vatPortion = Math.max(0, reclassedToDate - reclassedBefore);
      if (vatPortion > 0) {
        lines.push({ accountCode: '4428', debitCents: vatPortion, creditCents: 0, note: 'TVA devenită exigibilă' });
        lines.push({ accountCode: '4427', debitCents: 0, creditCents: vatPortion, note: 'TVA colectată (la încasare)' });
      }
    }

    return await postEntry(inv.companyId, {
      entryDate: pay.receivedAt ? new Date(pay.receivedAt).toISOString().slice(0, 10) : todayISO(),
      description: desc,
      source: 'payment',
      refType: 'payment',
      refId: pay.id,
      lines,
      createdByUserId,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Eroare la contarea încasării.' };
  }
}

// Map an expense category to a 6xx account.
function expenseAccountForCategory(category: string | null | undefined): string {
  switch (category) {
    case 'marfa': return '607';
    case 'combustibil': return '602';
    case 'chirie': return '612';
    case 'utilitati': return '605';
    case 'salarii': return '641';
    case 'taxe': return '635';
    case 'servicii': return '628';
    default: return '628';
  }
}

// ─── Bulk auto-post ────────────────────────────────────────────────────────
// Posts every not-yet-posted invoice / expense / payment for a company.
export async function autoPostAll(companyId: string, createdByUserId?: string | null): Promise<{ invoices: number; expenses: number; payments: number; skipped: number; errors: number }> {
  const out = { invoices: 0, expenses: 0, payments: 0, skipped: 0, errors: 0 };
  if (!companyId) return out;
  try {
    await ensureChart(companyId);

    const invs = await db
      .select({ id: transportInvoices.id })
      .from(transportInvoices)
      .where(and(eq(transportInvoices.companyId, companyId), inArray(transportInvoices.kind, ['factura', 'storno'])));
    for (const r of invs) {
      const res = await postInvoice(r.id, createdByUserId);
      if (res.ok && !res.skipped) out.invoices++;
      else if (res.skipped) out.skipped++;
      else out.errors++;
    }

    const exps = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.companyId, companyId));
    for (const r of exps) {
      const res = await postExpense(r.id, createdByUserId);
      if (res.ok && !res.skipped) out.expenses++;
      else if (res.skipped) out.skipped++;
      else out.errors++;
    }

    // Payments are scoped through their invoice's company.
    const pays = await db
      .select({ id: transportInvoicePayments.id })
      .from(transportInvoicePayments)
      .innerJoin(transportInvoices, eq(transportInvoicePayments.invoiceId, transportInvoices.id))
      .where(eq(transportInvoices.companyId, companyId));
    for (const r of pays) {
      const res = await postPayment(r.id, createdByUserId);
      if (res.ok && !res.skipped) out.payments++;
      else if (res.skipped) out.skipped++;
      else out.errors++;
    }
  } catch {
    // DB not ready — return whatever we counted (likely zeros).
  }
  return out;
}

// ─── Reports ───────────────────────────────────────────────────────────────
// For each account in the chart, computes opening (before `from`), period
// (from..to) and closing debit/credit totals. Closing is presented as a single
// net side depending on the natural balance.
export async function trialBalance(companyId: string, from: string, to: string): Promise<TrialBalanceRow[]> {
  if (!companyId) return [];
  try {
    const accounts = await listAccounts(companyId);
    const typeByCode = new Map(accounts.map((a) => [a.code, a.type as AccountType]));
    const nameByCode = new Map(accounts.map((a) => [a.code, a.name]));

    // Opening: everything strictly before `from`.
    const opening = from
      ? await db
          .select({
            code: journalLines.accountCode,
            d: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
            c: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
          })
          .from(journalLines)
          .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
          .where(and(eq(journalLines.companyId, companyId), sql`${journalEntries.entryDate} < ${from}`))
          .groupBy(journalLines.accountCode)
      : [];

    // Period: from..to inclusive.
    const periodWhere = [eq(journalLines.companyId, companyId)];
    if (from) periodWhere.push(gte(journalEntries.entryDate, from));
    if (to) periodWhere.push(lte(journalEntries.entryDate, to));
    const period = await db
      .select({
        code: journalLines.accountCode,
        d: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
        c: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...periodWhere))
      .groupBy(journalLines.accountCode);

    const openMap = new Map(opening.map((r) => [r.code, { d: Number(r.d), c: Number(r.c) }]));
    const perMap = new Map(period.map((r) => [r.code, { d: Number(r.d), c: Number(r.c) }]));

    const codes = new Set<string>([...openMap.keys(), ...perMap.keys()]);
    // Also include chart accounts that have any movement only.
    const rows: TrialBalanceRow[] = [];
    for (const code of Array.from(codes).sort()) {
      const o = openMap.get(code) || { d: 0, c: 0 };
      const p = perMap.get(code) || { d: 0, c: 0 };

      const openNet = o.d - o.c;
      const totalDebit = o.d + p.d;
      const totalCredit = o.c + p.c;
      const closeNet = totalDebit - totalCredit;

      rows.push({
        code,
        name: nameByCode.get(code) || code,
        type: typeByCode.get(code) || 'B',
        openingDebit: openNet > 0 ? openNet : 0,
        openingCredit: openNet < 0 ? -openNet : 0,
        periodDebit: p.d,
        periodCredit: p.c,
        closingDebit: closeNet > 0 ? closeNet : 0,
        closingCredit: closeNet < 0 ? -closeNet : 0,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

// Fișa contului: chronological lines for one account with a running balance.
export async function accountLedger(companyId: string, code: string, from: string, to: string): Promise<{ name: string; lines: LedgerLine[]; opening: number }> {
  const empty = { name: code, lines: [] as LedgerLine[], opening: 0 };
  if (!companyId || !code) return empty;
  try {
    const accounts = await listAccounts(companyId);
    const name = accounts.find((a) => a.code === code)?.name || code;

    // Opening balance before `from`.
    let opening = 0;
    if (from) {
      const [o] = await db
        .select({
          d: sql<number>`COALESCE(SUM(${journalLines.debitCents}), 0)`,
          c: sql<number>`COALESCE(SUM(${journalLines.creditCents}), 0)`,
        })
        .from(journalLines)
        .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
        .where(and(
          eq(journalLines.companyId, companyId),
          eq(journalLines.accountCode, code),
          sql`${journalEntries.entryDate} < ${from}`,
        ));
      opening = Number(o?.d ?? 0) - Number(o?.c ?? 0);
    }

    const where = [eq(journalLines.companyId, companyId), eq(journalLines.accountCode, code)];
    if (from) where.push(gte(journalEntries.entryDate, from));
    if (to) where.push(lte(journalEntries.entryDate, to));

    const raw = await db
      .select({
        entryId: journalEntries.id,
        entryNumber: journalEntries.entryNumber,
        entryDate: journalEntries.entryDate,
        description: journalEntries.description,
        debitCents: journalLines.debitCents,
        creditCents: journalLines.creditCents,
        note: journalLines.note,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...where))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber));

    let running = opening;
    const lines: LedgerLine[] = raw.map((r) => {
      running += Number(r.debitCents) - Number(r.creditCents);
      return {
        entryId: r.entryId,
        entryNumber: r.entryNumber,
        entryDate: r.entryDate,
        description: r.description,
        debitCents: Number(r.debitCents),
        creditCents: Number(r.creditCents),
        note: r.note,
        runningBalance: running,
      };
    });

    return { name, lines, opening };
  } catch {
    return empty;
  }
}

// Registru jurnal: all entries + their lines for a period, chronological.
export async function journalRegister(companyId: string, from: string, to: string) {
  if (!companyId) return [] as Array<{
    id: string; entryNumber: string | null; entryDate: string | null; description: string | null;
    source: string | null; totalDebitCents: number; totalCreditCents: number;
    lines: Array<{ accountCode: string; debitCents: number; creditCents: number; note: string | null }>;
  }>;
  try {
    const where = [eq(journalEntries.companyId, companyId)];
    if (from) where.push(gte(journalEntries.entryDate, from));
    if (to) where.push(lte(journalEntries.entryDate, to));

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(...where))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.entryNumber));

    const ids = entries.map((e) => e.id);
    let linesByEntry = new Map<string, Array<{ accountCode: string; debitCents: number; creditCents: number; note: string | null }>>();
    if (ids.length > 0) {
      const allLines = await db
        .select()
        .from(journalLines)
        .where(eq(journalLines.companyId, companyId));
      for (const l of allLines) {
        if (!ids.includes(l.entryId)) continue;
        const arr = linesByEntry.get(l.entryId) || [];
        arr.push({ accountCode: l.accountCode, debitCents: l.debitCents, creditCents: l.creditCents, note: l.note });
        linesByEntry.set(l.entryId, arr);
      }
    }

    return entries.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      entryDate: e.entryDate,
      description: e.description,
      source: e.source,
      totalDebitCents: e.totalDebitCents,
      totalCreditCents: e.totalCreditCents,
      lines: linesByEntry.get(e.id) || [],
    }));
  } catch {
    return [];
  }
}
