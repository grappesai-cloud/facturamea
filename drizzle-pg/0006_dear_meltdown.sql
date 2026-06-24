CREATE TABLE IF NOT EXISTS "blog_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" varchar(400) NOT NULL,
	"keywords" text,
	"category" varchar(60),
	"body_html" text NOT NULL,
	"read_minutes" integer DEFAULT 5,
	"status" varchar(16) DEFAULT 'published' NOT NULL,
	"published_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "blog_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_vat_payer" boolean;--> statement-breakpoint
ALTER TABLE "transport_invoice_lines" ADD COLUMN IF NOT EXISTS "product_id" text;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN IF NOT EXISTS "subtotal_ron_cents" integer;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN IF NOT EXISTS "vat_ron_cents" integer;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN IF NOT EXISTS "total_ron_cents" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blog_status_pub" ON "blog_posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_journal_entries_ref" ON "journal_entries" USING btree ("company_id","ref_type","ref_id") WHERE ref_type IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pos_sales_receipt" ON "pos_sales" USING btree ("company_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invoice_payment_ref" ON "transport_invoice_payments" USING btree ("invoice_id","reference") WHERE reference IS NOT NULL;
