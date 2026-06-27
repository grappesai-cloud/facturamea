ALTER TABLE "invoice_products" ALTER COLUMN "default_vat_rate" SET DEFAULT 21;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vat_scheme" varchar(20) DEFAULT 'normal';