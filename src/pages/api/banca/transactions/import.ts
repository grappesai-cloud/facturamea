import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { bankAccounts, bankTransactions } from '../../../../db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { parseStatement, MAX_STATEMENT_ROWS } from '../../../../lib/bank-parsers';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Import a bank statement (extras de cont) into an account.
// multipart/form-data: accountId + file. Dedupes on (companyId, externalId).
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const form = await request.formData().catch(() => null);
  if (!form) return new Response(JSON.stringify({ error: 'multipart/form-data invalid' }), { status: 400 });

  const accountId = String(form.get('accountId') || '');
  const file = form.get('file') as File | null;
  if (!accountId) return new Response(JSON.stringify({ error: 'Selectează un cont bancar' }), { status: 400 });
  if (!file || file.size === 0) return new Response(JSON.stringify({ error: 'Fișier lipsă' }), { status: 400 });
  if (file.size > MAX_FILE_BYTES) {
    return new Response(JSON.stringify({ error: `Fișier prea mare (maxim ${MAX_FILE_BYTES / 1024 / 1024} MB)` }), { status: 400 });
  }

  try {
    // Verify the account belongs to this company.
    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.companyId, cid)));
    if (!account) return new Response(JSON.stringify({ error: 'Cont inexistent' }), { status: 404 });

    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = parseStatement(buf, file.name);

    if (parsed.rows.length === 0) {
      return new Response(JSON.stringify({
        imported: 0, skipped: 0, total: 0, format: parsed.format,
        warnings: parsed.warnings,
        error: 'Nu am găsit nicio tranzacție în fișier. Verifică formatul (CSV sau MT940).',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const rows = parsed.rows.slice(0, MAX_STATEMENT_ROWS);
    const accountCurrency = account.currency || 'RON';

    // Dedupe: drop rows whose externalId already exists for this company,
    // and collapse duplicates within the same file.
    const incomingIds = Array.from(new Set(rows.map((r) => r.externalId!).filter(Boolean)));
    const existingIds = new Set<string>();
    if (incomingIds.length > 0) {
      // Chunk the IN list to keep the query bounded.
      for (let i = 0; i < incomingIds.length; i += 500) {
        const chunk = incomingIds.slice(i, i + 500);
        const found = await db.select({ externalId: bankTransactions.externalId })
          .from(bankTransactions)
          .where(and(eq(bankTransactions.companyId, cid), inArray(bankTransactions.externalId, chunk)));
        for (const f of found) if (f.externalId) existingIds.add(f.externalId);
      }
    }

    const seen = new Set<string>();
    const toInsert: typeof bankTransactions.$inferInsert[] = [];
    let skipped = 0;
    for (const r of rows) {
      const ext = r.externalId!;
      if (existingIds.has(ext) || seen.has(ext)) { skipped++; continue; }
      seen.add(ext);
      toInsert.push({
        id: nanoid(),
        companyId: cid,
        accountId,
        bookingDate: r.bookingDate ?? null,
        amountCents: r.amountCents,
        currency: accountCurrency,
        description: r.description ?? null,
        counterparty: r.counterparty ?? null,
        counterpartyIban: r.counterpartyIban ?? null,
        reference: r.reference ?? null,
        reconciled: false,
        externalId: ext,
      });
    }

    if (toInsert.length > 0) {
      // Bulk insert in chunks.
      for (let i = 0; i < toInsert.length; i += 500) {
        await db.insert(bankTransactions).values(toInsert.slice(i, i + 500));
      }
    }

    return new Response(JSON.stringify({
      imported: toInsert.length,
      skipped,
      total: rows.length,
      format: parsed.format,
      warnings: parsed.warnings,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Importul a eșuat. Verifică fișierul și baza de date.' }), { status: 500 });
  }
};
