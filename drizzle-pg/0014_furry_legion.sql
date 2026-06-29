ALTER TABLE "employees" ADD COLUMN "nr_dependents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD COLUMN "cm_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD COLUMN "cm_code" varchar(4);--> statement-breakpoint
ALTER TABLE "payroll_items" ADD COLUMN "cm_indemnization_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD COLUMN "cm_fnuass_cents" integer DEFAULT 0 NOT NULL;