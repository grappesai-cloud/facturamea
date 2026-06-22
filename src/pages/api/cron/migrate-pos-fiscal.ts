import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

// ONE-TIME migrare pos_sales -> coloane fiscale (ErpNet.FP / AMEF).
// Guard CRON_SECRET (Bearer). Idempotentă (IF NOT EXISTS). DE ȘTERS după rulare.
const STMTS = [
  `ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_status varchar(16) DEFAULT 'none' NOT NULL`,
  `ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_receipt_number varchar(64)`,
  `ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_serial varchar(64)`,
  `ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_error text`,
  `ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS fiscal_printed_at timestamp`,
];

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const applied: string[] = [];
  try {
    for (const stmt of STMTS) {
      await db.execute(sql.raw(stmt));
      applied.push(stmt.slice(0, 60));
    }
    const cols: any = await db.execute(sql.raw(
      `SELECT column_name FROM information_schema.columns WHERE table_name='pos_sales' AND column_name LIKE 'fiscal_%' ORDER BY column_name`
    ));
    return new Response(
      JSON.stringify({ ok: true, applied, fiscalColumns: cols.rows?.map((r: any) => r.column_name) ?? [] }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e), applied }), { status: 500 });
  }
};
