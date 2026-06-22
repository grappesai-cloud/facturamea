import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

// ONE-TIME migrare platform_settings + revenue_share_payouts (Stripe Connect).
// Guard CRON_SECRET (Bearer). Idempotentă. DE ȘTERS după rulare.
const STMTS = [
  `CREATE TABLE IF NOT EXISTS platform_settings (
    key varchar(64) PRIMARY KEY NOT NULL,
    value text,
    updated_at timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS revenue_share_payouts (
    id text PRIMARY KEY NOT NULL,
    source_type varchar(24) DEFAULT 'lifetime' NOT NULL,
    source_id varchar(128) NOT NULL,
    company_id text,
    destination_account varchar(64) NOT NULL,
    gross_cents integer DEFAULT 0 NOT NULL,
    fee_cents integer DEFAULT 0 NOT NULL,
    base_cents integer DEFAULT 0 NOT NULL,
    bps integer DEFAULT 0 NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency varchar(8) DEFAULT 'RON' NOT NULL,
    stripe_transfer_id varchar(64),
    status varchar(16) DEFAULT 'pending' NOT NULL,
    error text,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_revshare_source ON revenue_share_payouts (source_type, source_id)`,
  `CREATE INDEX IF NOT EXISTS idx_revshare_created ON revenue_share_payouts (created_at)`,
];

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const applied: string[] = [];
  try {
    for (const stmt of STMTS) {
      await db.execute(sql.raw(stmt));
      applied.push(stmt.slice(0, 48).replace(/\s+/g, ' '));
    }
    const t: any = await db.execute(sql.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_name IN ('platform_settings','revenue_share_payouts') ORDER BY table_name`
    ));
    return new Response(JSON.stringify({ ok: true, applied, tables: t.rows?.map((r: any) => r.table_name) ?? [] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e), applied }), { status: 500 });
  }
};
