ALTER TABLE "suppliers" ADD COLUMN "default_category" varchar(60);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "default_deductible" boolean;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "default_vat_scheme" varchar(20);