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
  try {
    const rows: any = await db.execute(sql.raw(`
      SELECT c.id, c.name, c.cui,
        (SELECT count(*) FROM transport_invoices WHERE company_id = c.id) AS inv,
        (SELECT count(*) FROM expenses WHERE company_id = c.id) AS exp,
        (SELECT count(*) FROM invoice_clients WHERE company_id = c.id) AS cli,
        (SELECT count(*) FROM pos_sales WHERE company_id = c.id) AS pos,
        (SELECT count(*) FROM journal_entries WHERE company_id = c.id) AS notes,
        (SELECT string_agg(email, ', ') FROM users WHERE company_id = c.id) AS users
      FROM companies c
      ORDER BY inv DESC, exp DESC`));
    const out = (rows.rows ?? rows ?? []).filter((r: any) => Number(r.inv) || Number(r.exp) || Number(r.cli) || Number(r.pos) || Number(r.notes) || r.users);
    return new Response(JSON.stringify({ companies: out }, null, 1), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
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
