// POST /api/banca/openbanking/sync
// body: { requisitionId: string, accountId?: string }
//
// After the user authorized the bank (via the GoCardless link), this:
//   1. reads the requisition to get the granted GoCardless account ids
//   2. for each, finds-or-creates a local bankAccounts row (matched on IBAN)
//   3. fetches transactions and inserts into bankTransactions (dedupe externalId)
//
// `accountId` (optional) pins all imported transactions to one existing local
// account instead of auto-creating per GoCardless account.
//
// Requires a session. Degrades to a clear 503 when GoCardless is not configured.

import type { APIRoute } from 'astro';
import { requireRole } from '../../../../lib/require-role';
import { db } from '../../../../db';
import { bankAccounts, bankTransactions } from '../../../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  isOpenBankingConfigured,
  getRequisition,
  getAccountDetails,
  getAccountTransactions,
} from '../../../../lib/openbanking';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NOT_CONFIGURED =
  'Open banking nu este configurat. Setează GOCARDLESS_SECRET_ID și GOCARDLESS_SECRET_KEY.';

// Insert normalized transactions into bankTransactions, deduping on
// (companyId, externalId). Returns { imported, skipped }.
async function importTransactions(
  cid: string,
  localAccountId: string,
  accountCurrency: string,
  txs: { bookingDate: string | null; amountCents: number; currency: string; description: string | null; counterparty: string | null; counterpartyIban?: string | null; reference: string | null; externalId: string }[],
): Promise<{ imported: number; skipped: number }> {
  if (txs.length === 0) return { imported: 0, skipped: 0 };

  const incomingIds = Array.from(new Set(txs.map((t) => t.externalId).filter(Boolean)));
  const existingIds = new Set<string>();
  for (let i = 0; i < incomingIds.length; i += 500) {
    const chunk = incomingIds.slice(i, i + 500);
    const found = await db.select({ externalId: bankTransactions.externalId })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.companyId, cid), inArray(bankTransactions.externalId, chunk)));
    for (const f of found) if (f.externalId) existingIds.add(f.externalId);
  }

  const seen = new Set<string>();
  const toInsert: typeof bankTransactions.$inferInsert[] = [];
  let skipped = 0;
  for (const t of txs) {
    const ext = t.externalId;
    if (!ext || existingIds.has(ext) || seen.has(ext)) { skipped++; continue; }
    seen.add(ext);
    toInsert.push({
      id: nanoid(),
      companyId: cid,
      accountId: localAccountId,
      bookingDate: t.bookingDate ?? null,
      amountCents: t.amountCents,
      currency: (t.currency || accountCurrency || 'RON').toUpperCase().slice(0, 5),
      description: t.description ?? null,
      counterparty: t.counterparty ?? null,
      counterpartyIban: t.counterpartyIban ?? null,
      reference: t.reference ?? null,
      reconciled: false,
      externalId: ext.slice(0, 120),
    });
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    await db.insert(bankTransactions).values(toInsert.slice(i, i + 500));
  }
  return { imported: toInsert.length, skipped };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);
  if (!isOpenBankingConfigured()) return json({ configured: false, error: NOT_CONFIGURED }, 503);

  const body = (await request.json().catch(() => ({}))) as any;
  const requisitionId = String(body.requisitionId || '').trim();
  const pinnedAccountId = body.accountId ? String(body.accountId).trim() : '';
  if (!requisitionId) return json({ error: 'Lipsește requisitionId.' }, 400);

  // Read the requisition to discover the granted GoCardless account ids.
  const reqRes = await getRequisition(requisitionId);
  if (!reqRes.ok || !reqRes.data) return json({ error: reqRes.error || 'Requisition inexistent.' }, 502);

  // Ownership binding: the requisition was created in connect.ts with a
  // reference of the form `fm-<companyId>-<ts>`. Verify the reference read back
  // from GoCardless encodes THIS caller's companyId, so a user cannot pass an
  // arbitrary requisitionId belonging to another company and import its bank
  // transactions. Reject 403 on any mismatch (or a missing/legacy reference).
  const ref = String(reqRes.data.reference || '');
  const m = ref.match(/^fm-(.+)-\d+$/);
  if (!m || m[1] !== cid) {
    return json({ error: 'Requisition nu aparține companiei tale.' }, 403);
  }

  const status = reqRes.data.status || '';
  const accountIds = reqRes.data.accounts || [];
  if (accountIds.length === 0) {
    return json({
      pending: true,
      status,
      error: 'Autorizarea la bancă nu este finalizată încă. Deschide linkul băncii și aprobă accesul, apoi sincronizează din nou.',
    }, 200);
  }

  // Validate a pinned local account belongs to this company up front.
  let pinned: typeof bankAccounts.$inferSelect | undefined;
  if (pinnedAccountId) {
    try {
      [pinned] = await db.select().from(bankAccounts)
        .where(and(eq(bankAccounts.id, pinnedAccountId), eq(bankAccounts.companyId, cid)))
        .limit(1);
    } catch {
      return json({ error: 'Eroare bază de date' }, 500);
    }
    if (!pinned) return json({ error: 'Contul bancar local selectat nu există.' }, 404);
  }

  let totalImported = 0;
  let totalSkipped = 0;
  const perAccount: { gcAccountId: string; localAccountId: string | null; imported: number; skipped: number; error?: string }[] = [];

  for (const gcAccountId of accountIds) {
    try {
      // Resolve the local account: pinned, else find-or-create by IBAN.
      let localAccountId: string;
      let accountCurrency = 'RON';

      if (pinned) {
        localAccountId = pinned.id;
        accountCurrency = pinned.currency || 'RON';
      } else {
        const details = await getAccountDetails(gcAccountId);
        const iban = details.ok ? details.data?.iban : undefined;
        const currency = (details.ok ? details.data?.currency : undefined) || 'RON';
        const name = (details.ok ? (details.data?.name || details.data?.ownerName) : undefined) || 'Cont open banking';

        let existing: typeof bankAccounts.$inferSelect | undefined;
        if (iban) {
          [existing] = await db.select().from(bankAccounts)
            .where(and(eq(bankAccounts.companyId, cid), eq(bankAccounts.iban, iban)))
            .limit(1);
        }
        if (existing) {
          localAccountId = existing.id;
          accountCurrency = existing.currency || currency;
        } else {
          localAccountId = nanoid();
          accountCurrency = currency;
          await db.insert(bankAccounts).values({
            id: localAccountId,
            companyId: cid,
            name: String(name).slice(0, 120),
            iban: iban ? String(iban).slice(0, 40) : null,
            bank: null,
            currency: String(currency).toUpperCase().slice(0, 5),
            isActive: true,
          } as any);
        }
      }

      const txRes = await getAccountTransactions(gcAccountId);
      if (!txRes.ok || !txRes.data) {
        perAccount.push({ gcAccountId, localAccountId, imported: 0, skipped: 0, error: txRes.error });
        continue;
      }
      const { imported, skipped } = await importTransactions(cid, localAccountId, accountCurrency, txRes.data);
      totalImported += imported;
      totalSkipped += skipped;
      perAccount.push({ gcAccountId, localAccountId, imported, skipped });
    } catch (err) {
      perAccount.push({ gcAccountId, localAccountId: null, imported: 0, skipped: 0, error: err instanceof Error ? err.message : 'eroare' });
    }
  }

  return json({
    ok: true,
    status,
    imported: totalImported,
    skipped: totalSkipped,
    accounts: perAccount,
  });
};
