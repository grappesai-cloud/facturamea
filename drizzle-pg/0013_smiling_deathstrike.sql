CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
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
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"company_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name_snap" varchar(200),
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"cas_cents" integer DEFAULT 0 NOT NULL,
	"cass_cents" integer DEFAULT 0 NOT NULL,
	"deduction_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"cam_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
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
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "deductible_pct" integer DEFAULT 100;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "default_deductible_pct" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "admin_role" varchar(20) DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_employees_company" ON "employees" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payroll_item" ON "payroll_items" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "idx_payroll_items_company" ON "payroll_items" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payroll_run_period" ON "payroll_runs" USING btree ("company_id","year","month");--> statement-breakpoint
CREATE INDEX "idx_payroll_runs_company" ON "payroll_runs" USING btree ("company_id");