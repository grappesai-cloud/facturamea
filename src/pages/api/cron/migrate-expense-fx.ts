// TEMP migration endpoint: add expenses.bnr_rate (for non-RON expense FX in
// declarations). Idempotent. CRON_SECRET-guarded. Delete after applying to prod.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  try {
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "bnr_rate" double precision`);
    return new Response(JSON.stringify({ ok: true, applied: 'expenses.bnr_rate' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
