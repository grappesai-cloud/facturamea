import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

// TEMP one-shot: add the deducere-auto + concediu-medical columns on prod.
// Idempotent (ADD COLUMN IF NOT EXISTS). Guarded by CRON_SECRET. Remove after.
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

  await run('employees.nr_dependents', `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "nr_dependents" integer DEFAULT 0 NOT NULL`);
  await run('payroll_items.cm_days', `ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "cm_days" integer DEFAULT 0 NOT NULL`);
  await run('payroll_items.cm_code', `ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "cm_code" varchar(4)`);
  await run('payroll_items.cm_indemnization_cents', `ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "cm_indemnization_cents" integer DEFAULT 0 NOT NULL`);
  await run('payroll_items.cm_fnuass_cents', `ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "cm_fnuass_cents" integer DEFAULT 0 NOT NULL`);

  // Clean up the verification test data left on the demo company.
  await run('cleanup items', `DELETE FROM "payroll_items" WHERE "employee_id" IN (SELECT "id" FROM "employees" WHERE "full_name" = 'Test CM Demo')`);
  await run('cleanup runs', `DELETE FROM "payroll_runs" WHERE "id" = 'PBLJKoYVWS-VAWK7BOKnm'`);
  await run('cleanup employee', `DELETE FROM "employees" WHERE "full_name" = 'Test CM Demo'`);

  return new Response(JSON.stringify({ ok: errs.length === 0, done, errs }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
