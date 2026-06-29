import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

// TEMP one-shot: add reg_com + caen to companies (for D112 + situații financiare).
// Idempotent. CRON_SECRET-guarded. Remove after.
export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const done: string[] = [];
  const errs: string[] = [];
  const run = async (label: string, q: string) => {
    try { await db.execute(sql.raw(q)); done.push(label); }
    catch (e: any) { errs.push(`${label}: ${e?.message || e}`); }
  };
  await run('companies.reg_com', `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "reg_com" varchar(50)`);
  await run('companies.caen', `ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "caen" varchar(10)`);
  return new Response(JSON.stringify({ ok: errs.length === 0, done, errs }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
