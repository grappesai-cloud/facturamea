// TEMP — Lot 4 migration: idempotency unique indexes (H6) + invoice-line productId
// (B4). Each step is independent and reports its own result (a unique index over
// pre-existing duplicate data fails — reported, not fatal). CRON_SECRET. DELETE after.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

const STEPS: Array<[string, string]> = [
  ['uq_journal_entries_ref', `CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_ref ON journal_entries (company_id, ref_type, ref_id) WHERE ref_type IS NOT NULL`],
  ['uq_invoice_payment_ref', `CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_payment_ref ON transport_invoice_payments (invoice_id, reference) WHERE reference IS NOT NULL`],
  ['uq_pos_sales_receipt', `CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_sales_receipt ON pos_sales (company_id, receipt_number)`],
  ['line_product_id', `ALTER TABLE transport_invoice_lines ADD COLUMN IF NOT EXISTS product_id text`],
];

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const out: Record<string, string> = {};
  for (const [name, ddl] of STEPS) {
    try { await db.execute(sql.raw(ddl)); out[name] = 'ok'; }
    catch (e) { out[name] = 'ERR: ' + String((e as Error).message).slice(0, 160); }
  }
  return new Response(JSON.stringify({ ok: true, steps: out }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
