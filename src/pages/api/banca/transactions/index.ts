import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { bankTransactions } from '../../../../db/schema';
import { and, eq, desc, type SQL } from 'drizzle-orm';

// List transactions for an account, optionally filtered by reconciled state.
// GET /api/banca/transactions?accountId=...&reconciled=false
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ transactions: [] }), { headers: { 'Content-Type': 'application/json' } });

  const accountId = url.searchParams.get('accountId') || '';
  const reconciledParam = url.searchParams.get('reconciled');

  const conds: SQL[] = [eq(bankTransactions.companyId, cid)];
  if (accountId) conds.push(eq(bankTransactions.accountId, accountId));
  if (reconciledParam === 'true') conds.push(eq(bankTransactions.reconciled, true));
  else if (reconciledParam === 'false') conds.push(eq(bankTransactions.reconciled, false));

  try {
    const transactions = await db.select().from(bankTransactions)
      .where(and(...conds))
      .orderBy(desc(bankTransactions.bookingDate), desc(bankTransactions.createdAt))
      .limit(1000);
    return new Response(JSON.stringify({ transactions }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ transactions: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};
