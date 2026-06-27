// One-shot migration: adds the per-supplier classification memory columns.
// Idempotent. Guarded by CRON_SECRET. Delete after running once on prod.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    await db.execute(sql`ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "default_category" varchar(60)`);
    await db.execute(sql`ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "default_deductible" boolean`);
    await db.execute(sql`ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "default_vat_scheme" varchar(20)`);
    return new Response(JSON.stringify({ ok: true, applied: ['suppliers.default_category', 'suppliers.default_deductible', 'suppliers.default_vat_scheme'] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'migrate failed' }), { status: 500 });
  }
};
