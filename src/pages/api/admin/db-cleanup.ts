// TEMP one-shot — pre-launch test-data cleanup. Admin-only (also middleware-gated).
//   GET  → enumerate companies + users + data counts (look before deleting).
//   POST { companyIds: string[] } → WIPE transactional/test data for those companies
//         (invoices, expenses, clients, products, stock, ledger postings, POS, bank,
//          e-Factura inbox, submissions…) and reset invoice series to 1.
//   KEEPS: the company, its users, billing data, ANAF connection, chart of accounts,
//          VAT rates and the lifetime license. Accounts stay usable, just emptied.
// Explicit company IDs only. Remove this file after use.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { companies, users, transportInvoices, expenses, invoiceClients } from '../../../db/schema';
import { eq, count } from 'drizzle-orm';

const isAdmin = (u: any) => u?.isAdmin === true || u?.userType === 'admin';

// Child rows cascade from their parent (verified onDelete:'cascade'), so deleting
// the parent is enough. Order respects the remaining FKs.
const WIPE_ORDER = [
  'transport_invoices', 'pos_sales', 'receptions',
  'stock_movements', 'stock_levels',
  'journal_lines', 'journal_entries',
  'efactura_inbox', 'etransport_declarations', 'anaf_submissions',
  'bank_transactions', 'bank_accounts',
  'fixed_assets', 'client_requests',
  'invoice_recurring', 'invoice_models',
  'expenses', 'warehouses', 'suppliers',
  'invoice_products', 'invoice_clients',
];

export const GET: APIRoute = async ({ locals }) => {
  if (!isAdmin(locals.user)) return new Response('forbidden', { status: 403 });
  const cos = await db.select({ id: companies.id, name: companies.name, cui: companies.cui }).from(companies);
  const out: any[] = [];
  for (const c of cos) {
    const usrs = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.companyId, c.id));
    const [inv] = await db.select({ n: count() }).from(transportInvoices).where(eq(transportInvoices.companyId, c.id));
    const [exp] = await db.select({ n: count() }).from(expenses).where(eq(expenses.companyId, c.id));
    const [cli] = await db.select({ n: count() }).from(invoiceClients).where(eq(invoiceClients.companyId, c.id));
    out.push({ id: c.id, name: c.name, cui: c.cui, users: usrs.map((u) => u.email), invoices: inv.n, expenses: exp.n, clients: cli.n });
  }
  return new Response(JSON.stringify({ companies: out }, null, 1), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals.user)) return new Response('forbidden', { status: 403 });
  const body = await request.json().catch(() => ({})) as any;
  const companyIds: string[] = Array.isArray(body.companyIds) ? body.companyIds.filter(Boolean) : [];
  if (companyIds.length === 0) return new Response(JSON.stringify({ error: 'companyIds necesare' }), { status: 400 });

  const report: any = {};
  for (const cid of companyIds) {
    const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cid)).limit(1);
    if (!co) { report[cid] = 'firmă inexistentă'; continue; }
    const deleted: Record<string, number> = {};
    for (const table of WIPE_ORDER) {
      try {
        const res: any = await db.execute(sql.raw(`DELETE FROM ${table} WHERE company_id = '${cid.replace(/'/g, "''")}'`));
        deleted[table] = res?.rowCount ?? 0;
      } catch (e: any) { deleted[table] = -1; }
    }
    // Reset invoice numbering so the company starts fresh from 0001.
    try { await db.execute(sql.raw(`UPDATE invoice_series SET next_number = 1 WHERE company_id = '${cid.replace(/'/g, "''")}'`)); } catch {}
    report[cid] = { name: co.name, deleted };
  }
  return new Response(JSON.stringify({ ok: true, report }, null, 1), { headers: { 'Content-Type': 'application/json' } });
};
