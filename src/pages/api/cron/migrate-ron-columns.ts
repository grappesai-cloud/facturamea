// TEMP — add the RON snapshot columns to transport_invoices + backfill existing
// rows. Idempotent (ADD COLUMN IF NOT EXISTS). CRON_SECRET. DELETE after running.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const out: Record<string, unknown> = {};
  try {
    await db.execute(sql`ALTER TABLE transport_invoices ADD COLUMN IF NOT EXISTS subtotal_ron_cents integer`);
    await db.execute(sql`ALTER TABLE transport_invoices ADD COLUMN IF NOT EXISTS vat_ron_cents integer`);
    await db.execute(sql`ALTER TABLE transport_invoices ADD COLUMN IF NOT EXISTS total_ron_cents integer`);
    out.columns = 'ok';
    const r1: any = await db.execute(sql`UPDATE transport_invoices SET subtotal_ron_cents = subtotal_cents, vat_ron_cents = vat_cents, total_ron_cents = total_cents WHERE (currency IS NULL OR currency = 'RON') AND total_ron_cents IS NULL`);
    out.backfillRon = r1?.rowCount ?? 0;
    const r2: any = await db.execute(sql`UPDATE transport_invoices SET subtotal_ron_cents = ROUND(subtotal_cents * bnr_rate), vat_ron_cents = ROUND(vat_cents * bnr_rate), total_ron_cents = ROUND(total_cents * bnr_rate) WHERE currency <> 'RON' AND bnr_rate IS NOT NULL AND total_ron_cents IS NULL`);
    out.backfillFx = r2?.rowCount ?? 0;
    return new Response(JSON.stringify({ ok: true, ...out }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message), ...out }), { status: 500 });
  }
};
