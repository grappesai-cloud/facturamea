CREATE TABLE "platform_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_share_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" varchar(24) DEFAULT 'lifetime' NOT NULL,
	"source_id" varchar(128) NOT NULL,
	"company_id" text,
	"destination_account" varchar(64) NOT NULL,
	"gross_cents" integer DEFAULT 0 NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"base_cents" integer DEFAULT 0 NOT NULL,
	"bps" integer DEFAULT 0 NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'RON' NOT NULL,
	"stripe_transfer_id" varchar(64),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revshare_source" ON "revenue_share_payouts" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_revshare_created" ON "revenue_share_payouts" USING btree ("created_at");