import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

// TEMP one-shot: create the Salarii (payroll) tables on prod (internal Coolify
// Postgres, unreachable from the laptop). Idempotent (IF NOT EXISTS). Remove after.
// Guarded by CRON_SECRET like the other /api/cron/* routes.
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

  await run('employees', `CREATE TABLE IF NOT EXISTS "employees" (
    "id" text PRIMARY KEY NOT NULL,
    "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
    "full_name" varchar(200) NOT NULL,
    "cnp" varchar(13),
    "position" varchar(120),
    "base_salary_cents" integer DEFAULT 0 NOT NULL,
    "deduction_cents" integer DEFAULT 0 NOT NULL,
    "employment_type" varchar(16) DEFAULT 'full_time' NOT NULL,
    "iban" varchar(34),
    "hired_at" date,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now()
  )`);

  await run('payroll_runs', `CREATE TABLE IF NOT EXISTS "payroll_runs" (
    "id" text PRIMARY KEY NOT NULL,
    "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "status" varchar(16) DEFAULT 'draft' NOT NULL,
    "total_gross_cents" integer DEFAULT 0 NOT NULL,
    "total_net_cents" integer DEFAULT 0 NOT NULL,
    "total_cas_cents" integer DEFAULT 0 NOT NULL,
    "total_cass_cents" integer DEFAULT 0 NOT NULL,
    "total_tax_cents" integer DEFAULT 0 NOT NULL,
    "total_cam_cents" integer DEFAULT 0 NOT NULL,
    "posted_journal_id" text,
    "finalized_at" timestamp,
    "created_at" timestamp DEFAULT now()
  )`);

  await run('payroll_items', `CREATE TABLE IF NOT EXISTS "payroll_items" (
    "id" text PRIMARY KEY NOT NULL,
    "run_id" text NOT NULL REFERENCES "payroll_runs"("id") ON DELETE cascade,
    "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
    "employee_id" text NOT NULL REFERENCES "employees"("id") ON DELETE cascade,
    "employee_name_snap" varchar(200),
    "gross_cents" integer DEFAULT 0 NOT NULL,
    "cas_cents" integer DEFAULT 0 NOT NULL,
    "cass_cents" integer DEFAULT 0 NOT NULL,
    "deduction_cents" integer DEFAULT 0 NOT NULL,
    "tax_cents" integer DEFAULT 0 NOT NULL,
    "net_cents" integer DEFAULT 0 NOT NULL,
    "cam_cents" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now()
  )`);

  await run('idx_employees_company', `CREATE INDEX IF NOT EXISTS "idx_employees_company" ON "employees" ("company_id")`);
  await run('uq_payroll_run_period', `CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_run_period" ON "payroll_runs" ("company_id","year","month")`);
  await run('idx_payroll_runs_company', `CREATE INDEX IF NOT EXISTS "idx_payroll_runs_company" ON "payroll_runs" ("company_id")`);
  await run('uq_payroll_item', `CREATE UNIQUE INDEX IF NOT EXISTS "uq_payroll_item" ON "payroll_items" ("run_id","employee_id")`);
  await run('idx_payroll_items_company', `CREATE INDEX IF NOT EXISTS "idx_payroll_items_company" ON "payroll_items" ("company_id")`);

  return new Response(JSON.stringify({ ok: errs.length === 0, done, errs }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
