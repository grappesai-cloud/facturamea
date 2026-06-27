// One-shot: adds partial-deductibility columns. Idempotent. CRON_SECRET. Delete after.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  try {
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "deductible_pct" integer DEFAULT 100`);
    await db.execute(sql`ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "default_deductible_pct" integer`);
    return new Response(JSON.stringify({ ok: true, applied: ['expenses.deductible_pct', 'suppliers.default_deductible_pct'] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'migrate failed' }), { status: 500 });
  }
};
