import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { bankAccounts, bankTransactions } from '../../../../db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Bank accounts owned by the current company (reconciliere bancară).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ accounts: [] }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const accounts = await db.select().from(bankAccounts)
      .where(eq(bankAccounts.companyId, cid))
      .orderBy(desc(bankAccounts.createdAt))
      .limit(200);

    // Count unreconciled transactions per account in one grouped query.
    const counts = await db
      .select({ accountId: bankTransactions.accountId, n: sql<number>`COUNT(*)` })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.companyId, cid), eq(bankTransactions.reconciled, false)))
      .groupBy(bankTransactions.accountId);
    const byAccount = new Map(counts.map((c) => [c.accountId, Number(c.n)]));

    // Live balance per account = opening balance + every imported transaction.
    const sums = await db
      .select({ accountId: bankTransactions.accountId, s: sql<number>`COALESCE(SUM(${bankTransactions.amountCents}), 0)` })
      .from(bankTransactions)
      .where(eq(bankTransactions.companyId, cid))
      .groupBy(bankTransactions.accountId);
    const sumByAccount = new Map(sums.map((c) => [c.accountId, Number(c.s)]));

    const out = accounts.map((a) => ({
      ...a,
      balanceCents: (a.balanceCents ?? 0) + (sumByAccount.get(a.id) ?? 0),
      unreconciledCount: byAccount.get(a.id) ?? 0,
    }));
    return new Response(JSON.stringify({ accounts: out }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ accounts: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const name = String(body.name ?? '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Numele contului este obligatoriu' }), { status: 400 });

  const id = nanoid();
  try {
    await db.insert(bankAccounts).values({
      id,
      companyId: cid,
      name: name.slice(0, 120),
      iban: body.iban ? String(body.iban).replace(/\s+/g, '').slice(0, 40) : null,
      bank: body.bank ? String(body.bank).trim().slice(0, 80) : null,
      currency: (String(body.currency ?? 'RON').trim().toUpperCase() || 'RON').slice(0, 5),
      balanceCents: 0,
      isActive: true,
    });
    return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Nu am putut salva contul. Verifică baza de date.' }), { status: 500 });
  }
};
