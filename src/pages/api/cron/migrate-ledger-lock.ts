// One-shot migration: adds companies.ledger_locked_until (period lock).
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
    await db.execute(sql`ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ledger_locked_until" date`);
    return new Response(JSON.stringify({ ok: true, applied: ['companies.ledger_locked_until'] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'migrate failed' }), { status: 500 });
  }
};
