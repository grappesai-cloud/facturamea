ALTER TABLE "pos_sales" ADD COLUMN "fiscal_status" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "fiscal_receipt_number" varchar(64);--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "fiscal_serial" varchar(64);--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "fiscal_error" text;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD COLUMN "fiscal_printed_at" timestamp;