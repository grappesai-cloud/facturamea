CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text,
	"mode" varchar(8) DEFAULT 'live' NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"iban" varchar(40),
	"bank" varchar(80),
	"currency" varchar(5) DEFAULT 'RON' NOT NULL,
	"balance_cents" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"booking_date" date,
	"amount_cents" integer NOT NULL,
	"currency" varchar(5) DEFAULT 'RON' NOT NULL,
	"description" text,
	"counterparty" varchar(200),
	"counterparty_iban" varchar(40),
	"reference" varchar(120),
	"reconciled" boolean DEFAULT false NOT NULL,
	"matched_type" varchar(16),
	"matched_id" text,
	"external_id" varchar(120),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "depreciation_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"company_id" text NOT NULL,
	"period" varchar(7) NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"posted_journal_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "efactura_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"anaf_msg_id" varchar(64) NOT NULL,
	"msg_type" varchar(32),
	"from_cif" varchar(20),
	"supplier_name" varchar(200),
	"detail" text,
	"xml" text,
	"total_cents" integer,
	"currency" varchar(5) DEFAULT 'RON',
	"issue_date" date,
	"status" varchar(20) DEFAULT 'nou' NOT NULL,
	"imported_expense_id" text,
	"received_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" varchar(300) NOT NULL,
	"html" text NOT NULL,
	"preheader" varchar(300),
	"audience" varchar(40) DEFAULT 'all' NOT NULL,
	"custom_recipients" text,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"total_recipients" integer DEFAULT 0,
	"sent_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"created_by_admin_id" text,
	"created_at" timestamp DEFAULT now(),
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "etransport_declarations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"uit" varchar(64),
	"spv_index" varchar(64),
	"operation_type" varchar(40),
	"sender_name" varchar(200),
	"recipient_name" varchar(200),
	"loading_address" text,
	"unloading_address" text,
	"vehicle_plate" varchar(20),
	"goods_json" text,
	"total_value_cents" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"error_text" text,
	"xml" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"inventory_number" varchar(40),
	"category" varchar(80),
	"acquisition_date" date,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"useful_life_months" integer DEFAULT 12 NOT NULL,
	"method" varchar(16) DEFAULT 'liniara',
	"accumulated_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"disposed_at" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"source" varchar(40),
	"entity" varchar(30),
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0,
	"imported_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"error_log" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"provider" varchar(40) NOT NULL,
	"label" varchar(120),
	"base_url" text,
	"config_enc" text,
	"webhook_secret" varchar(64),
	"auto_invoice" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"sent_to" varchar(200),
	"sent_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"entry_number" varchar(32),
	"entry_date" date,
	"description" text,
	"source" varchar(24) DEFAULT 'manual',
	"ref_type" varchar(24),
	"ref_id" text,
	"total_debit_cents" integer DEFAULT 0 NOT NULL,
	"total_credit_cents" integer DEFAULT 0 NOT NULL,
	"posted" boolean DEFAULT true NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"company_id" text NOT NULL,
	"account_code" varchar(12) NOT NULL,
	"debit_cents" integer DEFAULT 0 NOT NULL,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	"note" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(2) DEFAULT 'B' NOT NULL,
	"parent_code" varchar(12),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"name" varchar(300) NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 21,
	"line_total_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"number" varchar(40) NOT NULL,
	"supplier_id" text,
	"supplier_name_snap" varchar(200),
	"order_date" date,
	"expected_date" date,
	"currency" varchar(5) DEFAULT 'RON',
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text,
	"name" varchar(300) NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 21,
	"line_total_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"number" varchar(40) NOT NULL,
	"client_external_id" text,
	"client_name_snap" varchar(200),
	"order_date" date,
	"currency" varchar(5) DEFAULT 'RON',
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"invoice_id" text,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"provider" varchar(24) NOT NULL,
	"awb" varchar(64),
	"invoice_id" text,
	"recipient_name" varchar(200),
	"recipient_phone" varchar(40),
	"address" text,
	"city" varchar(120),
	"county" varchar(80),
	"parcels" integer DEFAULT 1,
	"weight_kg" double precision,
	"cod_cents" integer DEFAULT 0,
	"status" varchar(24) DEFAULT 'draft',
	"label_url" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"count_id" text NOT NULL,
	"product_id" text NOT NULL,
	"system_qty" double precision DEFAULT 0 NOT NULL,
	"counted_qty" double precision DEFAULT 0 NOT NULL,
	"diff_qty" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"number" varchar(40),
	"count_date" date,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text,
	"product_id" text NOT NULL,
	"lot_code" varchar(64) NOT NULL,
	"expiry_date" date,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "efactura_auto_send" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "dunning_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "cost_method" varchar(8) DEFAULT 'cmp';--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN "payment_link_url" text;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN "payment_link_id" varchar(80);--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD COLUMN "payment_link_status" varchar(16);--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "depreciation_entries" ADD CONSTRAINT "depreciation_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efactura_inbox" ADD CONSTRAINT "efactura_inbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etransport_declarations" ADD CONSTRAINT "etransport_declarations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etransport_declarations" ADD CONSTRAINT "etransport_declarations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_client_external_id_invoice_clients_id_fk" FOREIGN KEY ("client_external_id") REFERENCES "public"."invoice_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_company" ON "api_keys" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_api_keys_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_company" ON "bank_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_company" ON "bank_transactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_account" ON "bank_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_reconciled" ON "bank_transactions" USING btree ("company_id","reconciled");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_depreciation_period" ON "depreciation_entries" USING btree ("asset_id","period");--> statement-breakpoint
CREATE INDEX "idx_depreciation_company" ON "depreciation_entries" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_efactura_inbox_msg" ON "efactura_inbox" USING btree ("company_id","anaf_msg_id");--> statement-breakpoint
CREATE INDEX "idx_efactura_inbox_company" ON "efactura_inbox" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_email_campaigns_status" ON "email_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_etransport_company" ON "etransport_declarations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_fixed_assets_company" ON "fixed_assets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_company" ON "import_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_integration_conn_company" ON "integration_connections" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_integration_webhook" ON "integration_connections" USING btree ("webhook_secret");--> statement-breakpoint
CREATE INDEX "idx_invoice_reminders_company" ON "invoice_reminders" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invoice_reminder" ON "invoice_reminders" USING btree ("invoice_id","kind");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_company" ON "journal_entries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_date" ON "journal_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "idx_journal_entries_ref" ON "journal_entries" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_journal_entries_company_number" ON "journal_entries" USING btree ("company_id","entry_number");--> statement-breakpoint
CREATE INDEX "idx_journal_lines_entry" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_journal_lines_account" ON "journal_lines" USING btree ("company_id","account_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ledger_accounts_code" ON "ledger_accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "idx_ledger_accounts_company" ON "ledger_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_po_lines_order" ON "purchase_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_company" ON "purchase_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_so_lines_order" ON "sales_order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_sales_orders_company" ON "sales_orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_shipments_company" ON "shipments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_stock_count_lines_count" ON "stock_count_lines" USING btree ("count_id");--> statement-breakpoint
CREATE INDEX "idx_stock_counts_company" ON "stock_counts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_stock_lots_company" ON "stock_lots" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_stock_lots_product" ON "stock_lots" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_billing_addresses_company" ON "billing_addresses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_payment_methods_company" ON "payment_methods" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_transport_clauses_company" ON "transport_clauses" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "chk_credit_balance_nonneg" CHECK ("credit_balances"."balance" >= 0);