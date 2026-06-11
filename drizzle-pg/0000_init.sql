CREATE TABLE "anaf_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"cif" varchar(20),
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_expires_at" timestamp NOT NULL,
	"refresh_expires_at" timestamp NOT NULL,
	"connected_by_user_id" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "anaf_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"redirect_after" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anaf_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"scope" varchar(32) NOT NULL,
	"action" varchar(40) NOT NULL,
	"ref_type" varchar(32),
	"ref_id" text,
	"uit" varchar(64),
	"spv_index" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"payload" jsonb,
	"response" jsonb,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"plan" varchar(20) DEFAULT 'trial' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"trial_ends_at" timestamp,
	"activated_at" timestamp,
	"amount_cents" integer,
	"currency" varchar(5) DEFAULT 'RON',
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"granted_by_admin_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auction_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"auction_id" text NOT NULL,
	"bidder_user_id" text NOT NULL,
	"bidder_company_id" text NOT NULL,
	"price_total" double precision NOT NULL,
	"price_per_km" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"includes_tva" boolean DEFAULT false,
	"truck_type_id" varchar(50),
	"message" text,
	"valid_until" timestamp,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auction_truck_types" (
	"auction_id" text NOT NULL,
	"truck_type_id" varchar(50) NOT NULL,
	CONSTRAINT "auction_truck_types_auction_id_truck_type_id_pk" PRIMARY KEY("auction_id","truck_type_id")
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" integer,
	"posted_by" text NOT NULL,
	"company_id" text NOT NULL,
	"title" varchar(500),
	"status" varchar(20) DEFAULT 'active',
	"loading_city_id" integer,
	"loading_city_name" varchar(500) NOT NULL,
	"loading_country" varchar(10) NOT NULL,
	"loading_postal" varchar(20),
	"loading_lat" double precision,
	"loading_lng" double precision,
	"unloading_city_id" integer,
	"unloading_city_name" varchar(500) NOT NULL,
	"unloading_country" varchar(10) NOT NULL,
	"unloading_postal" varchar(20),
	"unloading_lat" double precision,
	"unloading_lng" double precision,
	"loading_date" date NOT NULL,
	"loading_date_end" date,
	"weight" double precision,
	"volume" double precision,
	"quantity" integer DEFAULT 1,
	"distance_km" integer,
	"is_full_truck" boolean DEFAULT true,
	"description" text,
	"starting_price" double precision,
	"reserve_price" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"includes_tva" boolean DEFAULT false,
	"award_mode" varchar(20) DEFAULT 'manual',
	"ends_at" timestamp NOT NULL,
	"winner_bid_id" text,
	"order_id" text,
	"awarded_at" timestamp,
	"cancelled_at" timestamp,
	"bid_count" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "auctions_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"company_id" text,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(50),
	"entity_id" text,
	"ip_address" varchar(64),
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "available_trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" integer,
	"posted_by" text NOT NULL,
	"company_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"departure_city_id" integer,
	"departure_city_name" varchar(500) NOT NULL,
	"departure_country" varchar(10) NOT NULL,
	"departure_lat" double precision,
	"departure_lng" double precision,
	"destination_city_name" varchar(500),
	"destination_country" varchar(10),
	"destination_lat" double precision,
	"destination_lng" double precision,
	"destination_flexible" boolean DEFAULT false,
	"available_from" date NOT NULL,
	"available_to" varchar(20),
	"truck_type_id" varchar(50),
	"license_plate" varchar(50),
	"max_weight" double precision,
	"max_volume" double precision,
	"is_full_truck" boolean DEFAULT true,
	"has_adr" boolean DEFAULT false,
	"has_frigo" boolean DEFAULT false,
	"has_lift" boolean DEFAULT false,
	"has_walking_floor" boolean DEFAULT false,
	"has_mega_trailer" boolean DEFAULT false,
	"has_gondola" boolean DEFAULT false,
	"price_per_km" double precision,
	"price_total" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"includes_tva" boolean DEFAULT false,
	"description" text,
	"floor_length" double precision,
	"vehicle_count" integer,
	"permitted_countries" text,
	"extra_stops" jsonb,
	"contract_type" varchar(20) DEFAULT 'spot',
	"is_featured" boolean DEFAULT false,
	"expires_at" timestamp,
	"view_count" integer DEFAULT 0,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "available_trucks_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "billing_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"legal_name" varchar(300) NOT NULL,
	"cui" varchar(50),
	"reg_com" varchar(50),
	"iban" varchar(50),
	"bank" varchar(200),
	"address" text NOT NULL,
	"city" varchar(200) NOT NULL,
	"country_code" varchar(5) NOT NULL,
	"postal_code" varchar(20),
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bnr_rates_daily" (
	"rate_date" date NOT NULL,
	"currency" varchar(5) NOT NULL,
	"rate" double precision NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bnr_rates_daily_rate_date_currency_pk" PRIMARY KEY("rate_date","currency")
);
--> statement-breakpoint
CREATE TABLE "border_crossings" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"country_a" varchar(5) NOT NULL,
	"country_b" varchar(5) NOT NULL,
	"wait_minutes_outbound" integer,
	"wait_minutes_inbound" integer,
	"measured_at" timestamp,
	"source" varchar(40),
	CONSTRAINT "border_crossings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"segment" varchar(40) NOT NULL,
	"send_email" boolean DEFAULT false NOT NULL,
	"recipients_count" integer,
	"sent_at" timestamp DEFAULT now(),
	"sent_by" text
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(500) NOT NULL,
	"name_ascii" varchar(500) NOT NULL,
	"alternate_names" text,
	"postal_code" varchar(20),
	"country_code" varchar(5) NOT NULL,
	"country_name" varchar(100) NOT NULL,
	"county" varchar(120),
	"is_place" boolean DEFAULT true NOT NULL,
	"latitude" double precision,
	"longitude" double precision
);
--> statement-breakpoint
CREATE TABLE "classified_images" (
	"id" text PRIMARY KEY NOT NULL,
	"classified_id" text NOT NULL,
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "classifieds" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text,
	"category" varchar(50) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"price" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"location_city" varchar(500),
	"location_country" varchar(10),
	"contact_phone" varchar(50),
	"contact_name" varchar(255),
	"status" varchar(20) DEFAULT 'active',
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cmr_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"party" varchar(20) NOT NULL,
	"signed_by_user_id" text NOT NULL,
	"signed_by_name" varchar(255) NOT NULL,
	"signature_png" text NOT NULL,
	"signature_hash" varchar(64) NOT NULL,
	"prev_hash" varchar(64),
	"client_ts" timestamp,
	"ip_address" varchar(64),
	"user_agent" text,
	"signed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(500) NOT NULL,
	"cui" varchar(50),
	"country" varchar(100) NOT NULL,
	"city" varchar(200),
	"address" text,
	"phone" varchar(50),
	"email" varchar(255),
	"website" varchar(500),
	"description" text,
	"logo_url" text,
	"subscription_tier" varchar(20) DEFAULT 'free',
	"subscription_expires_at" timestamp,
	"is_verified" boolean DEFAULT false,
	"rating_avg" double precision DEFAULT 0,
	"rating_count" integer DEFAULT 0,
	"kyc_status" varchar(20),
	"kyc_submitted_at" timestamp,
	"kyc_reviewed_at" timestamp,
	"kyc_reviewer_id" text,
	"kyc_rejection_reason" text,
	"stripe_customer_id" text,
	"invoice_logo_url" text,
	"invoice_stamp_url" text,
	"invoice_signature_url" text,
	"invoice_footer_text" text,
	"tva_at_collection" boolean DEFAULT false,
	"payment_score" integer,
	"avg_days_to_pay" double precision,
	"payment_incident_count" integer DEFAULT 0,
	"payment_score_updated_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_badges" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" varchar(200) NOT NULL,
	"metadata" text,
	"awarded_at" timestamp DEFAULT now(),
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "company_blacklist" (
	"owner_company_id" text NOT NULL,
	"blocked_company_id" text NOT NULL,
	"reason" text,
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "company_blacklist_owner_company_id_blocked_company_id_pk" PRIMARY KEY("owner_company_id","blocked_company_id")
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" varchar(40) NOT NULL,
	"name" varchar(300) NOT NULL,
	"url" text NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"issued_at" varchar(20),
	"expires_at" varchar(20),
	"notes" text,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_favorites" (
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "company_favorites_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "company_licenses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" varchar(40) NOT NULL,
	"number" varchar(100) NOT NULL,
	"issued_by" varchar(200),
	"issued_at" varchar(20),
	"expires_at" varchar(20),
	"status" varchar(20) DEFAULT 'active',
	"verified_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" varchar(30) DEFAULT 'office' NOT NULL,
	"name" varchar(200) NOT NULL,
	"country_code" varchar(5) NOT NULL,
	"city" varchar(200) NOT NULL,
	"address" text,
	"postal_code" varchar(20),
	"latitude" double precision,
	"longitude" double precision,
	"phone" varchar(50),
	"contact_name" varchar(200),
	"opening_hours" text,
	"notes" text,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text,
	"last_read_at" timestamp,
	"is_archived" boolean DEFAULT false,
	"is_muted" boolean DEFAULT false,
	"joined_at" timestamp DEFAULT now(),
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"context_type" varchar(30),
	"context_id" text,
	"order_id" text,
	"subject" varchar(500),
	"last_message_at" timestamp DEFAULT now(),
	"last_message_preview" varchar(500),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(10) NOT NULL,
	"discount_value" integer NOT NULL,
	"description" text,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"company_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0,
	"total_purchased" integer DEFAULT 0,
	"total_consumed" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text,
	"type" varchar(20) NOT NULL,
	"service_code" varchar(50),
	"amount_crb" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reference" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dossier_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"kind" varchar(24) NOT NULL,
	"file_url" text NOT NULL,
	"file_name" varchar(200),
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dossier_events" (
	"id" text PRIMARY KEY NOT NULL,
	"dossier_id" text NOT NULL,
	"kind" varchar(24) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"by_user_id" text,
	"latitude" double precision,
	"longitude" double precision,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"type" varchar(30) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"reason" text,
	"document_number" varchar(100),
	"issued_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "driver_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"activity" varchar(20) NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"duration_minutes" integer,
	"source" varchar(20) DEFAULT 'manual',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"cnp" varchar(20),
	"license_number" varchar(50),
	"license_categories" varchar(50),
	"license_expires_at" timestamp,
	"card_tacho_number" varchar(50),
	"card_tacho_expires_at" timestamp,
	"cqc_expires_at" timestamp,
	"phone" varchar(50),
	"email" varchar(255),
	"hire_date" timestamp,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "e_cmr_consignments" (
	"id" text PRIMARY KEY NOT NULL,
	"consignment_no" varchar(40) NOT NULL,
	"company_id" text NOT NULL,
	"created_by_user_id" text,
	"order_id" text,
	"dossier_id" text,
	"freight_id" text,
	"public_token" varchar(48) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp,
	"in_transit_at" timestamp,
	"delivered_at" timestamp,
	"archived_at" timestamp,
	"cancelled_at" timestamp,
	"sender_company_id" text,
	"sender_name" varchar(255) NOT NULL,
	"sender_address" text,
	"sender_city" varchar(120),
	"sender_country" varchar(60),
	"sender_cui" varchar(40),
	"consignee_company_id" text,
	"consignee_name" varchar(255) NOT NULL,
	"consignee_address" text,
	"consignee_city" varchar(120),
	"consignee_country" varchar(60),
	"consignee_cui" varchar(40),
	"delivery_place" varchar(255),
	"delivery_country" varchar(60),
	"delivery_date_planned" date,
	"taking_over_place" varchar(255),
	"taking_over_country" varchar(60),
	"taking_over_date_planned" date,
	"annexed_docs" text,
	"marks_numbers" text,
	"packages_count" integer,
	"packing_method" varchar(120),
	"goods_nature" text NOT NULL,
	"statistical_number" varchar(60),
	"gross_weight_kg" double precision,
	"volume_m3" double precision,
	"carrier_company_id" text,
	"carrier_name" varchar(255),
	"carrier_address" text,
	"carrier_country" varchar(60),
	"carrier_cui" varchar(40),
	"successive_carriers" text,
	"sender_instructions" text,
	"carrier_reservations" text,
	"cod_amount_cents" integer,
	"cod_currency" varchar(8),
	"special_agreements" text,
	"charges_paid_by" varchar(20),
	"freight_price_cents" integer,
	"freight_currency" varchar(8),
	"established_at_place" varchar(255),
	"established_at_date" date,
	"vehicle_plate" varchar(20),
	"trailer_plate" varchar(20),
	"driver_name" varchar(200),
	"driver_id_doc" varchar(80),
	"last_known_lat" double precision,
	"last_known_lng" double precision,
	"last_known_at" timestamp,
	"recipient_signature_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "e_cmr_consignments_consignment_no_unique" UNIQUE("consignment_no"),
	CONSTRAINT "e_cmr_consignments_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
CREATE TABLE "e_cmr_events" (
	"id" text PRIMARY KEY NOT NULL,
	"consignment_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"by_user_id" text,
	"by_name" varchar(255),
	"latitude" double precision,
	"longitude" double precision,
	"notes" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "e_cmr_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"consignment_id" text NOT NULL,
	"party" varchar(20) NOT NULL,
	"signed_by_user_id" text,
	"signed_by_name" varchar(255) NOT NULL,
	"signed_by_role" varchar(120),
	"signature_png" text NOT NULL,
	"signature_hash" varchar(64) NOT NULL,
	"prev_hash" varchar(64),
	"client_ts" timestamp,
	"ip_address" varchar(64),
	"user_agent" text,
	"signed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "entity_views" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" text NOT NULL,
	"viewer_user_id" text NOT NULL,
	"viewer_company_id" text,
	"view_count" integer DEFAULT 1 NOT NULL,
	"first_viewed_at" timestamp DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"supplier_id" text,
	"supplier_name_snap" varchar(200),
	"category" varchar(60),
	"document_type" varchar(20) DEFAULT 'factura',
	"document_number" varchar(64),
	"issue_date" date,
	"due_date" date,
	"currency" varchar(5) DEFAULT 'RON',
	"net_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'unpaid' NOT NULL,
	"deductible" boolean DEFAULT true,
	"attachment_url" text,
	"attachment_name" varchar(200),
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "factoring_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text,
	"order_id" text,
	"company_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(5) DEFAULT 'RON' NOT NULL,
	"status" varchar(20) DEFAULT 'waitlist' NOT NULL,
	"partner" varchar(50),
	"fee_percent" double precision,
	"expected_payout_at" timestamp,
	"paid_at" timestamp,
	"rejection_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 100 NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "flagged_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_type" varchar(20) NOT NULL,
	"contact_value" varchar(200) NOT NULL,
	"reason" varchar(100),
	"reported_by_company_id" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false,
	"is_locked" boolean DEFAULT false,
	"reply_count" integer DEFAULT 0,
	"last_reply_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "freight" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" integer,
	"posted_by" text NOT NULL,
	"company_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"loading_city_id" integer,
	"loading_city_name" varchar(500) NOT NULL,
	"loading_country" varchar(10) NOT NULL,
	"loading_postal" varchar(20),
	"loading_lat" double precision,
	"loading_lng" double precision,
	"unloading_city_id" integer,
	"unloading_city_name" varchar(500) NOT NULL,
	"unloading_country" varchar(10) NOT NULL,
	"unloading_postal" varchar(20),
	"unloading_lat" double precision,
	"unloading_lng" double precision,
	"loading_date" date NOT NULL,
	"loading_date_end" date,
	"weight" double precision,
	"volume" double precision,
	"floor_meters" double precision,
	"quantity" integer DEFAULT 1,
	"description" text,
	"distance_km" integer,
	"is_full_truck" boolean DEFAULT true,
	"is_round_trip" boolean DEFAULT false,
	"price_per_km" double precision,
	"price_total" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"includes_tva" boolean DEFAULT false,
	"contract_type" varchar(20) DEFAULT 'spot',
	"contract_months" integer,
	"contract_frequency" varchar(30),
	"freight_mode" varchar(10) DEFAULT 'ftl',
	"payment_term_days" integer,
	"adr_class" varchar(10),
	"container_type" varchar(20),
	"vehicle_count" integer,
	"is_featured" boolean DEFAULT false,
	"is_auction" boolean DEFAULT false NOT NULL,
	"auction_ends_at" timestamp,
	"extra_stops" jsonb,
	"expires_at" timestamp,
	"view_count" integer DEFAULT 0,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "freight_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "freight_bids" (
	"id" text PRIMARY KEY NOT NULL,
	"freight_id" text NOT NULL,
	"bidder_user_id" text NOT NULL,
	"bidder_company_id" text NOT NULL,
	"price_total" double precision NOT NULL,
	"price_per_km" double precision,
	"currency" varchar(5) DEFAULT 'EUR',
	"includes_tva" boolean DEFAULT false,
	"truck_type_id" varchar(50),
	"message" text,
	"valid_until" timestamp,
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "freight_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"freight_id" text NOT NULL,
	"type" varchar(40) NOT NULL,
	"name" varchar(300) NOT NULL,
	"url" text NOT NULL,
	"file_size" integer,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "freight_equipment" (
	"freight_id" text NOT NULL,
	"equipment" varchar(100) NOT NULL,
	CONSTRAINT "freight_equipment_freight_id_equipment_pk" PRIMARY KEY("freight_id","equipment")
);
--> statement-breakpoint
CREATE TABLE "freight_favorites" (
	"user_id" text NOT NULL,
	"freight_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "freight_favorites_user_id_freight_id_pk" PRIMARY KEY("user_id","freight_id")
);
--> statement-breakpoint
CREATE TABLE "freight_truck_types" (
	"freight_id" text NOT NULL,
	"truck_type_id" varchar(50) NOT NULL,
	CONSTRAINT "freight_truck_types_freight_id_truck_type_id_pk" PRIMARY KEY("freight_id","truck_type_id")
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base_currency" varchar(5) NOT NULL,
	"quote_currency" varchar(5) NOT NULL,
	"rate" double precision NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"source" varchar(20) DEFAULT 'ecb',
	CONSTRAINT "fx_rates_base_currency_quote_currency_pk" PRIMARY KEY("base_currency","quote_currency")
);
--> statement-breakpoint
CREATE TABLE "gps_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"provider" varchar(30) DEFAULT 'cargotrack' NOT NULL,
	"username" varchar(255),
	"password_enc" text,
	"config_enc" text,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"last_sync_status" varchar(20),
	"last_error" text,
	"device_count" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incident_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"attachment_url" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"reporter_user_id" text NOT NULL,
	"reporter_company_id" text NOT NULL,
	"against_company_id" text NOT NULL,
	"against_user_id" text,
	"category" varchar(40) NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"claimed_amount" double precision,
	"currency" varchar(5),
	"is_public" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'open',
	"admin_reviewed_by" text,
	"admin_reviewed_at" timestamp,
	"admin_notes" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "info_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"title_ro" varchar(500) NOT NULL,
	"title_en" varchar(500),
	"body_ro" text NOT NULL,
	"body_en" text,
	"attachment_url" text,
	"is_published" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"published_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "info_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invoice_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_company_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"tax_id" varchar(32),
	"is_vat_payer" boolean DEFAULT false NOT NULL,
	"registry_number" varchar(50),
	"country" varchar(60) DEFAULT 'Romania' NOT NULL,
	"county" varchar(60),
	"city" varchar(80),
	"address" text,
	"postal_code" varchar(20),
	"contact_name" varchar(120),
	"email" varchar(160),
	"phone" varchar(32),
	"iban" varchar(40),
	"bank" varchar(80),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_guarantees" (
	"id" text PRIMARY KEY NOT NULL,
	"buyer_company_id" text NOT NULL,
	"buyer_user_id" text NOT NULL,
	"payer_company_id" text,
	"payer_name" varchar(200),
	"payer_cui" varchar(50),
	"invoice_number" varchar(100) NOT NULL,
	"invoice_date" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount" double precision NOT NULL,
	"currency" varchar(3) DEFAULT 'RON',
	"premium_crb" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"description" text,
	"claimed_at" timestamp,
	"reimbursed_at" timestamp,
	"reimbursed_amount" double precision,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_models" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"layout_key" varchar(24) DEFAULT 'classic' NOT NULL,
	"brand_color" varchar(16) DEFAULT '#0A0A0A',
	"logo_url" text,
	"footer_text" text,
	"show_qr" boolean DEFAULT false NOT NULL,
	"show_shipping" boolean DEFAULT true NOT NULL,
	"show_emitted_with" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_products" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"code" varchar(64),
	"name" varchar(300) NOT NULL,
	"description" text,
	"default_unit_price_cents" integer,
	"default_currency" varchar(5) DEFAULT 'RON',
	"default_um" varchar(16) DEFAULT 'buc',
	"default_vat_rate" double precision DEFAULT 19,
	"product_type" varchar(40) DEFAULT 'Servicii',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_recurring" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"client_company_id" text,
	"client_external_id" text,
	"name" varchar(200) NOT NULL,
	"frequency" varchar(20) NOT NULL,
	"start_at" date NOT NULL,
	"end_at" date,
	"next_run_at" date NOT NULL,
	"last_run_at" date,
	"series_id" text,
	"currency" varchar(5) DEFAULT 'RON',
	"vat_regime" varchar(24) DEFAULT 'standard',
	"lines_json" text NOT NULL,
	"payment_term_days" integer DEFAULT 30,
	"send_email" boolean DEFAULT true,
	"recipient_email" varchar(255),
	"notes" text,
	"is_active" boolean DEFAULT true,
	"total_runs" integer DEFAULT 0,
	"max_runs" integer,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_series" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"scope" varchar(16),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_tva_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"percent" double precision DEFAULT 0 NOT NULL,
	"regime" varchar(24) DEFAULT 'standard' NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"company_id" text NOT NULL,
	"subscription_id" text,
	"status" varchar(20) DEFAULT 'issued',
	"amount_cents" integer NOT NULL,
	"vat_cents" integer DEFAULT 0,
	"total_cents" integer NOT NULL,
	"currency" varchar(5) DEFAULT 'EUR',
	"issued_at" timestamp DEFAULT now(),
	"due_at" timestamp,
	"paid_at" timestamp,
	"pdf_url" text,
	"provider_ref" varchar(100),
	"efactura_xml" text,
	"efactura_status" varchar(20),
	"efactura_submitted_at" timestamp,
	"efactura_anaf_id" text,
	"efactura_error" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "marketplace_clicks" (
	"id" text PRIMARY KEY NOT NULL,
	"classified_id" text NOT NULL,
	"user_id" text,
	"ip_address" varchar(64),
	"clicked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"attachment_url" text,
	"attachment_type" varchar(50),
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(200) NOT NULL,
	"title_ro" varchar(500) NOT NULL,
	"title_en" varchar(500),
	"body_ro" text NOT NULL,
	"body_en" text,
	"category" varchar(50),
	"cover_image_url" text,
	"published_at" timestamp,
	"is_published" boolean DEFAULT false,
	"view_count" integer DEFAULT 0,
	"author_user_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "news_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true,
	"in_app_enabled" boolean DEFAULT true,
	"type_overrides" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text,
	"link_url" varchar(500),
	"entity_type" varchar(30),
	"entity_id" text,
	"read_at" timestamp,
	"email_sent_at" timestamp,
	"email_error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(500),
	"file_url" text NOT NULL,
	"mime_type" varchar(100),
	"size_bytes" integer,
	"stage" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"reported_by" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" double precision,
	"heading_deg" double precision,
	"accuracy_m" double precision,
	"source" varchar(30) DEFAULT 'manual',
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_stops" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"kind" varchar(12) NOT NULL,
	"position" integer DEFAULT 1 NOT NULL,
	"city_name" varchar(200),
	"country" varchar(10),
	"postal" varchar(20),
	"address" text,
	"company_name" varchar(200),
	"lat" double precision,
	"lng" double precision,
	"scheduled_date" varchar(20),
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"arrived_at" timestamp,
	"done_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_tracking_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"token" varchar(64) NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "order_tracking_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"freight_id" text NOT NULL,
	"client_user_id" text NOT NULL,
	"client_company_id" text NOT NULL,
	"carrier_user_id" text,
	"carrier_company_id" text,
	"carrier_platform_id" varchar(20),
	"vehicle_plate" varchar(50),
	"driver_name" varchar(120),
	"driver_phone" varchar(40),
	"status" varchar(20) DEFAULT 'open',
	"assigned_at" timestamp,
	"accepted_at" timestamp,
	"loaded_at" timestamp,
	"delivered_at" timestamp,
	"closed_at" timestamp,
	"cmr_photo_url" text,
	"cmr_uploaded_at" timestamp,
	"clauses" text,
	"client_notes" text,
	"carrier_notes" text,
	"insurance_chosen" boolean DEFAULT false NOT NULL,
	"insurance_provider" varchar(80),
	"insurance_premium" double precision,
	"insurance_coverage" double precision,
	"co2_kg" double precision,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"brand" varchar(30),
	"last4" varchar(8),
	"exp_month" integer,
	"exp_year" integer,
	"provider_token" text,
	"provider" varchar(30),
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text,
	"company_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(5) DEFAULT 'EUR',
	"status" varchar(20) DEFAULT 'pending',
	"payment_method_id" text,
	"provider" varchar(30),
	"provider_tx_id" varchar(200),
	"error_message" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"name_ro" varchar(100) NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"period_months" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"max_freight_posts" integer,
	"max_truck_posts" integer,
	"max_auctions" integer,
	"max_users" integer,
	"max_locations" integer,
	"features" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pos_sale_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text,
	"name" varchar(300) NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 21,
	"line_total_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pos_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text,
	"receipt_number" varchar(64) NOT NULL,
	"cashier_user_id" text,
	"payment_method" varchar(16) DEFAULT 'cash' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"cash_received_cents" integer DEFAULT 0,
	"change_cents" integer DEFAULT 0,
	"invoice_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "public_tracking_tokens" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"scope" varchar(20) DEFAULT 'view' NOT NULL,
	"provider" varchar(40),
	"expires_at" timestamp,
	"views_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp,
	"last_ingest_at" timestamp,
	"ingest_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth_key" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"to_company_id" text NOT NULL,
	"score" integer NOT NULL,
	"punctuality" integer,
	"communication" integer,
	"cargo_condition" integer,
	"documentation" integer,
	"payment_reliability" integer,
	"comment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reception_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"reception_id" text NOT NULL,
	"product_id" text,
	"name" varchar(300) NOT NULL,
	"um" varchar(16) DEFAULT 'buc',
	"quantity" double precision NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" double precision DEFAULT 21,
	"line_total_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receptions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"supplier_id" text,
	"nir_number" varchar(64) NOT NULL,
	"supplier_invoice_number" varchar(64),
	"reception_date" date,
	"net_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "route_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(200),
	"type" varchar(20) NOT NULL,
	"loading_country" varchar(10),
	"loading_city" varchar(500),
	"unloading_country" varchar(10),
	"unloading_city" varchar(500),
	"truck_type_id" varchar(50),
	"is_active" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "saved_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" varchar(20) NOT NULL,
	"loading_country" varchar(10),
	"loading_city" varchar(500),
	"unloading_country" varchar(10),
	"unloading_city" varchar(500),
	"truck_type_id" varchar(50),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "services_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_ro" varchar(200) NOT NULL,
	"name_en" varchar(200),
	"description_ro" text,
	"description_en" text,
	"price_crb" double precision NOT NULL,
	"price_lei" double precision,
	"category" varchar(50),
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "services_catalog_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_banner" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" double precision DEFAULT 0 NOT NULL,
	"avg_cost_cents" integer DEFAULT 0 NOT NULL,
	"min_quantity" double precision DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"product_id" text NOT NULL,
	"kind" varchar(16) NOT NULL,
	"quantity" double precision NOT NULL,
	"unit_cost_cents" integer DEFAULT 0,
	"reason" varchar(200),
	"ref_type" varchar(20),
	"ref_id" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'trial',
	"started_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"cancelled_at" timestamp,
	"auto_renew" boolean DEFAULT true,
	"trial_until" timestamp,
	"payment_method_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"cui" varchar(32),
	"reg_com" varchar(32),
	"address" text,
	"city" varchar(120),
	"country" varchar(80) DEFAULT 'Romania',
	"iban" varchar(40),
	"email" varchar(255),
	"phone" varchar(50),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tachograph_files" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text,
	"company_id" text NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"file_url" text NOT NULL,
	"file_name" varchar(255),
	"file_size_bytes" integer,
	"file_type" varchar(20),
	"parsed" boolean DEFAULT false NOT NULL,
	"parse_summary" jsonb,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "totp_pending_logins" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_clauses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_dossiers" (
	"id" text PRIMARY KEY NOT NULL,
	"display_id" varchar(32) NOT NULL,
	"company_id" text NOT NULL,
	"created_by_user_id" text,
	"client_company_id" text,
	"client_external_id" text,
	"client_order_ref" varchar(80),
	"client_price_cents" integer,
	"client_currency" varchar(5) DEFAULT 'RON',
	"client_tax_id" varchar(20),
	"client_vat_payer" boolean,
	"freight_id" text,
	"assigned_carrier_company_id" text,
	"assigned_carrier_user_id" text,
	"carrier_price_cents" integer,
	"carrier_currency" varchar(5) DEFAULT 'RON',
	"carrier_order_id" text,
	"loading_city" varchar(120),
	"loading_country" varchar(60),
	"loading_date" date,
	"unloading_city" varchar(120),
	"unloading_country" varchar(60),
	"unloading_date" date,
	"weight" double precision,
	"volume" double precision,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "transport_dossiers_display_id_unique" UNIQUE("display_id")
);
--> statement-breakpoint
CREATE TABLE "transport_invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"code" varchar(64),
	"description" text NOT NULL,
	"quantity" double precision DEFAULT 1 NOT NULL,
	"unit" varchar(16) DEFAULT 'buc' NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"vat_rate" double precision DEFAULT 0 NOT NULL,
	"line_total_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_invoice_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(5) DEFAULT 'RON' NOT NULL,
	"method" varchar(24),
	"reference" varchar(80),
	"received_at" timestamp DEFAULT now() NOT NULL,
	"recorded_by_user_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transport_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"issued_by_user_id" text,
	"series_id" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"full_number" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"client_company_id" text,
	"client_external_id" text,
	"client_name_snap" varchar(200) NOT NULL,
	"client_tax_id_snap" varchar(32),
	"client_address_snap" text,
	"order_id" text,
	"parent_invoice_id" text,
	"model_id" text,
	"currency" varchar(5) DEFAULT 'RON' NOT NULL,
	"vat_regime" varchar(24) DEFAULT 'standard',
	"subtotal_cents" integer NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"issued_at" timestamp,
	"sent_at" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"pdf_url" text,
	"efactura_xml" text,
	"efactura_status" varchar(20),
	"efactura_submitted_at" timestamp,
	"efactura_anaf_id" text,
	"efactura_error" text,
	"bnr_rate" double precision,
	"bnr_rate_date" date,
	"vat_at_collection" boolean DEFAULT false,
	"chitanta_for_invoice_id" text,
	"language" varchar(5) DEFAULT 'ro' NOT NULL,
	"precision" integer DEFAULT 2 NOT NULL,
	"share_token" varchar(40),
	"attachment_url" text,
	"attachment_name" varchar(200),
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truck_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"truck_id" text NOT NULL,
	"company_id" text NOT NULL,
	"kind" varchar(40) NOT NULL,
	"name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"issued_at" date,
	"expires_at" date,
	"notes" text,
	"uploaded_by_user_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truck_favorites" (
	"user_id" text NOT NULL,
	"truck_id" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "truck_favorites_user_id_truck_id_pk" PRIMARY KEY("user_id","truck_id")
);
--> statement-breakpoint
CREATE TABLE "truck_positions" (
	"truck_id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"speed_kmh" double precision,
	"heading_deg" double precision,
	"device_id" varchar(120),
	"recorded_at" timestamp,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "truck_types" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name_ro" varchar(100) NOT NULL,
	"name_en" varchar(100),
	"icon" varchar(50),
	"sort_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"added_by" text NOT NULL,
	"license_plate" varchar(50) NOT NULL,
	"vehicle_class" varchar(20) DEFAULT 'truck' NOT NULL,
	"truck_type_id" varchar(50),
	"brand" varchar(100),
	"model" varchar(100),
	"year" integer,
	"max_weight" double precision,
	"max_volume" double precision,
	"euro_class" varchar(20),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_company_memberships" (
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"role" varchar(20) DEFAULT 'member',
	"is_default" boolean DEFAULT false,
	"joined_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_company_memberships_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"platform_id" varchar(20) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"hashed_password" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"user_type" varchar(50) NOT NULL,
	"is_admin" boolean DEFAULT false,
	"company_id" text,
	"parent_user_id" text,
	"avatar_url" text,
	"phone" varchar(50),
	"is_active" boolean DEFAULT true,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"totp_recovery_codes" text,
	"totp_enrolled_at" timestamp,
	"deleted_at" timestamp,
	"referral_code" varchar(20),
	"referred_by_user_id" text,
	"referral_bonus_paid" boolean DEFAULT false NOT NULL,
	"is_founder" boolean DEFAULT false NOT NULL,
	"founder_number" integer,
	"onboarding_seen_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_platform_id_unique" UNIQUE("platform_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code"),
	CONSTRAINT "users_founder_number_unique" UNIQUE("founder_number")
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"phone" varchar(40),
	"company_name" varchar(200),
	"company_type" varchar(30) NOT NULL,
	"accepted_tc" boolean DEFAULT false NOT NULL,
	"accepted_gdpr" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"thank_you_sent_at" timestamp,
	"notified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"code" varchar(32),
	"type" varchar(20) DEFAULT 'depozit' NOT NULL,
	"address" text,
	"management_type" varchar(20) DEFAULT 'cantitativ_valoric',
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "anaf_connections" ADD CONSTRAINT "anaf_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anaf_connections" ADD CONSTRAINT "anaf_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anaf_submissions" ADD CONSTRAINT "anaf_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anaf_submissions" ADD CONSTRAINT "anaf_submissions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_licenses" ADD CONSTRAINT "app_licenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidder_user_id_users_id_fk" FOREIGN KEY ("bidder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidder_company_id_companies_id_fk" FOREIGN KEY ("bidder_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_truck_types" ADD CONSTRAINT "auction_truck_types_auction_id_auctions_id_fk" FOREIGN KEY ("auction_id") REFERENCES "public"."auctions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_truck_types" ADD CONSTRAINT "auction_truck_types_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "available_trucks" ADD CONSTRAINT "available_trucks_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "available_trucks" ADD CONSTRAINT "available_trucks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "available_trucks" ADD CONSTRAINT "available_trucks_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_addresses" ADD CONSTRAINT "billing_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classified_images" ADD CONSTRAINT "classified_images_classified_id_classifieds_id_fk" FOREIGN KEY ("classified_id") REFERENCES "public"."classifieds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifieds" ADD CONSTRAINT "classifieds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifieds" ADD CONSTRAINT "classifieds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmr_signatures" ADD CONSTRAINT "cmr_signatures_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmr_signatures" ADD CONSTRAINT "cmr_signatures_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_badges" ADD CONSTRAINT "company_badges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_blacklist" ADD CONSTRAINT "company_blacklist_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_blacklist" ADD CONSTRAINT "company_blacklist_blocked_company_id_companies_id_fk" FOREIGN KEY ("blocked_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_blacklist" ADD CONSTRAINT "company_blacklist_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_documents" ADD CONSTRAINT "company_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_favorites" ADD CONSTRAINT "company_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_favorites" ADD CONSTRAINT "company_favorites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_licenses" ADD CONSTRAINT "company_licenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_locations" ADD CONSTRAINT "company_locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_documents" ADD CONSTRAINT "dossier_documents_dossier_id_transport_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."transport_dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_documents" ADD CONSTRAINT "dossier_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_events" ADD CONSTRAINT "dossier_events_dossier_id_transport_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."transport_dossiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossier_events" ADD CONSTRAINT "dossier_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_certificates" ADD CONSTRAINT "driver_certificates_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_certificates" ADD CONSTRAINT "driver_certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_hours" ADD CONSTRAINT "driver_hours_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_dossier_id_transport_dossiers_id_fk" FOREIGN KEY ("dossier_id") REFERENCES "public"."transport_dossiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_sender_company_id_companies_id_fk" FOREIGN KEY ("sender_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_consignee_company_id_companies_id_fk" FOREIGN KEY ("consignee_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_consignments" ADD CONSTRAINT "e_cmr_consignments_carrier_company_id_companies_id_fk" FOREIGN KEY ("carrier_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_events" ADD CONSTRAINT "e_cmr_events_consignment_id_e_cmr_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."e_cmr_consignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_events" ADD CONSTRAINT "e_cmr_events_by_user_id_users_id_fk" FOREIGN KEY ("by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_signatures" ADD CONSTRAINT "e_cmr_signatures_consignment_id_e_cmr_consignments_id_fk" FOREIGN KEY ("consignment_id") REFERENCES "public"."e_cmr_consignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e_cmr_signatures" ADD CONSTRAINT "e_cmr_signatures_signed_by_user_id_users_id_fk" FOREIGN KEY ("signed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_views" ADD CONSTRAINT "entity_views_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_views" ADD CONSTRAINT "entity_views_viewer_company_id_companies_id_fk" FOREIGN KEY ("viewer_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factoring_requests" ADD CONSTRAINT "factoring_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factoring_requests" ADD CONSTRAINT "factoring_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_thread_id_forum_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_replies" ADD CONSTRAINT "forum_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forum_threads" ADD CONSTRAINT "forum_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight" ADD CONSTRAINT "freight_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight" ADD CONSTRAINT "freight_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_bids" ADD CONSTRAINT "freight_bids_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_bids" ADD CONSTRAINT "freight_bids_bidder_user_id_users_id_fk" FOREIGN KEY ("bidder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_bids" ADD CONSTRAINT "freight_bids_bidder_company_id_companies_id_fk" FOREIGN KEY ("bidder_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_bids" ADD CONSTRAINT "freight_bids_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_documents" ADD CONSTRAINT "freight_documents_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_documents" ADD CONSTRAINT "freight_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_equipment" ADD CONSTRAINT "freight_equipment_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_favorites" ADD CONSTRAINT "freight_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_favorites" ADD CONSTRAINT "freight_favorites_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_truck_types" ADD CONSTRAINT "freight_truck_types_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freight_truck_types" ADD CONSTRAINT "freight_truck_types_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gps_integrations" ADD CONSTRAINT "gps_integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_replies" ADD CONSTRAINT "incident_replies_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_replies" ADD CONSTRAINT "incident_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_company_id_companies_id_fk" FOREIGN KEY ("reporter_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_against_company_id_companies_id_fk" FOREIGN KEY ("against_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_against_user_id_users_id_fk" FOREIGN KEY ("against_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_admin_reviewed_by_users_id_fk" FOREIGN KEY ("admin_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_clients" ADD CONSTRAINT "invoice_clients_owner_company_id_companies_id_fk" FOREIGN KEY ("owner_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_guarantees" ADD CONSTRAINT "invoice_guarantees_buyer_company_id_companies_id_fk" FOREIGN KEY ("buyer_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_guarantees" ADD CONSTRAINT "invoice_guarantees_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_models" ADD CONSTRAINT "invoice_models_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_products" ADD CONSTRAINT "invoice_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_recurring" ADD CONSTRAINT "invoice_recurring_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_recurring" ADD CONSTRAINT "invoice_recurring_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_recurring" ADD CONSTRAINT "invoice_recurring_client_external_id_invoice_clients_id_fk" FOREIGN KEY ("client_external_id") REFERENCES "public"."invoice_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_recurring" ADD CONSTRAINT "invoice_recurring_series_id_invoice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."invoice_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_recurring" ADD CONSTRAINT "invoice_recurring_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_series" ADD CONSTRAINT "invoice_series_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tva_rates" ADD CONSTRAINT "invoice_tva_rates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_clicks" ADD CONSTRAINT "marketplace_clicks_classified_id_classifieds_id_fk" FOREIGN KEY ("classified_id") REFERENCES "public"."classifieds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_clicks" ADD CONSTRAINT "marketplace_clicks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_positions" ADD CONSTRAINT "order_positions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_positions" ADD CONSTRAINT "order_positions_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stops" ADD CONSTRAINT "order_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tracking_shares" ADD CONSTRAINT "order_tracking_shares_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_tracking_shares" ADD CONSTRAINT "order_tracking_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_user_id_users_id_fk" FOREIGN KEY ("client_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_carrier_user_id_users_id_fk" FOREIGN KEY ("carrier_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_carrier_company_id_companies_id_fk" FOREIGN KEY ("carrier_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_sale_id_pos_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pos_sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sale_lines" ADD CONSTRAINT "pos_sale_lines_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_cashier_user_id_users_id_fk" FOREIGN KEY ("cashier_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_tracking_tokens" ADD CONSTRAINT "public_tracking_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_tracking_tokens" ADD CONSTRAINT "public_tracking_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_to_company_id_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_alerts" ADD CONSTRAINT "route_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_routes" ADD CONSTRAINT "saved_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_invoice_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."invoice_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tachograph_files" ADD CONSTRAINT "tachograph_files_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tachograph_files" ADD CONSTRAINT "tachograph_files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tachograph_files" ADD CONSTRAINT "tachograph_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_pending_logins" ADD CONSTRAINT "totp_pending_logins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_clauses" ADD CONSTRAINT "transport_clauses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_client_external_id_invoice_clients_id_fk" FOREIGN KEY ("client_external_id") REFERENCES "public"."invoice_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_freight_id_freight_id_fk" FOREIGN KEY ("freight_id") REFERENCES "public"."freight"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_assigned_carrier_company_id_companies_id_fk" FOREIGN KEY ("assigned_carrier_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_assigned_carrier_user_id_users_id_fk" FOREIGN KEY ("assigned_carrier_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_dossiers" ADD CONSTRAINT "transport_dossiers_carrier_order_id_orders_id_fk" FOREIGN KEY ("carrier_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoice_lines" ADD CONSTRAINT "transport_invoice_lines_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoice_payments" ADD CONSTRAINT "transport_invoice_payments_invoice_id_transport_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."transport_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoice_payments" ADD CONSTRAINT "transport_invoice_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_series_id_invoice_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."invoice_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_client_company_id_companies_id_fk" FOREIGN KEY ("client_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_client_external_id_invoice_clients_id_fk" FOREIGN KEY ("client_external_id") REFERENCES "public"."invoice_clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_invoices" ADD CONSTRAINT "transport_invoices_model_id_invoice_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."invoice_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_documents" ADD CONSTRAINT "truck_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_favorites" ADD CONSTRAINT "truck_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_favorites" ADD CONSTRAINT "truck_favorites_truck_id_available_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."available_trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_positions" ADD CONSTRAINT "truck_positions_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_positions" ADD CONSTRAINT "truck_positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_truck_type_id_truck_types_id_fk" FOREIGN KEY ("truck_type_id") REFERENCES "public"."truck_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_company_memberships" ADD CONSTRAINT "user_company_memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_anaf_company_scope" ON "anaf_connections" USING btree ("company_id","scope");--> statement-breakpoint
CREATE INDEX "idx_anaf_access_expires" ON "anaf_connections" USING btree ("access_expires_at");--> statement-breakpoint
CREATE INDEX "idx_anaf_subm_company" ON "anaf_submissions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_anaf_subm_ref" ON "anaf_submissions" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "idx_anaf_subm_uit" ON "anaf_submissions" USING btree ("uit");--> statement-breakpoint
CREATE INDEX "idx_anaf_subm_created" ON "anaf_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_licenses_company" ON "app_licenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_bids_auction" ON "auction_bids" USING btree ("auction_id");--> statement-breakpoint
CREATE INDEX "idx_bids_bidder" ON "auction_bids" USING btree ("bidder_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_bids_auction_company" ON "auction_bids" USING btree ("auction_id","bidder_company_id");--> statement-breakpoint
CREATE INDEX "idx_auctions_status" ON "auctions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_auctions_loading" ON "auctions" USING btree ("loading_country","loading_city_name");--> statement-breakpoint
CREATE INDEX "idx_auctions_unloading" ON "auctions" USING btree ("unloading_country","unloading_city_name");--> statement-breakpoint
CREATE INDEX "idx_auctions_ends" ON "auctions" USING btree ("ends_at");--> statement-breakpoint
CREATE INDEX "idx_auctions_company" ON "auctions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_auctions_featured" ON "auctions" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "idx_auctions_posted_by" ON "auctions" USING btree ("posted_by");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_status" ON "available_trucks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_departure" ON "available_trucks" USING btree ("departure_country","departure_city_name");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_date" ON "available_trucks" USING btree ("available_from");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_company" ON "available_trucks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_featured" ON "available_trucks" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_posted_by" ON "available_trucks" USING btree ("posted_by");--> statement-breakpoint
CREATE INDEX "idx_avail_trucks_deleted_at" ON "available_trucks" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_bnr_rates_date" ON "bnr_rates_daily" USING btree ("rate_date");--> statement-breakpoint
CREATE INDEX "idx_cities_name_ascii" ON "cities" USING btree ("name_ascii");--> statement-breakpoint
CREATE INDEX "idx_cities_postal" ON "cities" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX "idx_cities_country" ON "cities" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "idx_cities_is_place" ON "cities" USING btree ("is_place");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_cities_country_name_postal" ON "cities" USING btree ("country_code","name_ascii","postal_code");--> statement-breakpoint
CREATE INDEX "idx_classifieds_category" ON "classifieds" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_classifieds_status" ON "classifieds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_cmr_sig_order" ON "cmr_signatures" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_cmr_sig_party" ON "cmr_signatures" USING btree ("party");--> statement-breakpoint
CREATE INDEX "idx_companies_cui" ON "companies" USING btree ("cui");--> statement-breakpoint
CREATE INDEX "idx_companies_country" ON "companies" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_companies_verified" ON "companies" USING btree ("is_verified");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_company_badge" ON "company_badges" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "idx_badge_company" ON "company_badges" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_blacklist_blocked" ON "company_blacklist" USING btree ("blocked_company_id");--> statement-breakpoint
CREATE INDEX "idx_company_documents_company" ON "company_documents" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_documents_expires" ON "company_documents" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_company_licenses_company" ON "company_licenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_licenses_expires" ON "company_licenses" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_locations_company" ON "company_locations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_locations_type" ON "company_locations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_part_user" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_conv_last_msg" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conv_context" ON "conversations" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE INDEX "idx_conv_order" ON "conversations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_company" ON "credit_transactions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_credit_tx_created" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_dossier_docs_dossier" ON "dossier_documents" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "idx_dossier_events_dossier" ON "dossier_events" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "idx_dossier_events_kind" ON "dossier_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_driver_cert_driver" ON "driver_certificates" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_driver_cert_type" ON "driver_certificates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_driver_hours_driver" ON "driver_hours" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_driver_hours_started" ON "driver_hours" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_drivers_company" ON "drivers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_company" ON "e_cmr_consignments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_status" ON "e_cmr_consignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ecmr_order" ON "e_cmr_consignments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_dossier" ON "e_cmr_consignments" USING btree ("dossier_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_carrier" ON "e_cmr_consignments" USING btree ("carrier_company_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_consignee" ON "e_cmr_consignments" USING btree ("consignee_company_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_issued" ON "e_cmr_consignments" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "idx_ecmr_events_consignment" ON "e_cmr_events" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_events_kind" ON "e_cmr_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_ecmr_sig_consignment" ON "e_cmr_signatures" USING btree ("consignment_id");--> statement-breakpoint
CREATE INDEX "idx_ecmr_sig_party" ON "e_cmr_signatures" USING btree ("party");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_entity_views_unique" ON "entity_views" USING btree ("entity_type","entity_id","viewer_user_id");--> statement-breakpoint
CREATE INDEX "idx_entity_views_entity" ON "entity_views" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_entity_views_viewer" ON "entity_views" USING btree ("viewer_user_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_company" ON "expenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_status" ON "expenses" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_factoring_company" ON "factoring_requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_factoring_status" ON "factoring_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_factoring_created" ON "factoring_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_flagged_value" ON "flagged_contacts" USING btree ("contact_value");--> statement-breakpoint
CREATE INDEX "idx_flagged_type" ON "flagged_contacts" USING btree ("contact_type");--> statement-breakpoint
CREATE INDEX "idx_replies_thread" ON "forum_replies" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_threads_created" ON "forum_threads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_freight_status" ON "freight" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_freight_loading" ON "freight" USING btree ("loading_country","loading_city_name");--> statement-breakpoint
CREATE INDEX "idx_freight_unloading" ON "freight" USING btree ("unloading_country","unloading_city_name");--> statement-breakpoint
CREATE INDEX "idx_freight_date" ON "freight" USING btree ("loading_date");--> statement-breakpoint
CREATE INDEX "idx_freight_company" ON "freight" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_freight_contract_type" ON "freight" USING btree ("contract_type");--> statement-breakpoint
CREATE INDEX "idx_freight_featured" ON "freight" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "idx_freight_posted_by" ON "freight" USING btree ("posted_by");--> statement-breakpoint
CREATE INDEX "idx_freight_deleted_at" ON "freight" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_freight_bids_freight" ON "freight_bids" USING btree ("freight_id");--> statement-breakpoint
CREATE INDEX "idx_freight_bids_bidder" ON "freight_bids" USING btree ("bidder_company_id");--> statement-breakpoint
CREATE INDEX "idx_freight_documents_freight" ON "freight_documents" USING btree ("freight_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_gps_company_provider" ON "gps_integrations" USING btree ("company_id","provider");--> statement-breakpoint
CREATE INDEX "idx_incident_replies" ON "incident_replies" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "idx_incidents_against" ON "incidents" USING btree ("against_company_id","is_public");--> statement-breakpoint
CREATE INDEX "idx_incidents_reporter" ON "incidents" USING btree ("reporter_company_id");--> statement-breakpoint
CREATE INDEX "idx_incidents_status" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_info_category" ON "info_articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_invoice_clients_owner" ON "invoice_clients" USING btree ("owner_company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_clients_tax" ON "invoice_clients" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "idx_guarantee_buyer" ON "invoice_guarantees" USING btree ("buyer_company_id");--> statement-breakpoint
CREATE INDEX "idx_guarantee_status" ON "invoice_guarantees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_guarantee_due" ON "invoice_guarantees" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_invoice_models_company" ON "invoice_models" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_products_company" ON "invoice_products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_products_active" ON "invoice_products" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_recurring_company" ON "invoice_recurring" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_next" ON "invoice_recurring" USING btree ("is_active","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_series_company" ON "invoice_series" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_tva_rates_company" ON "invoice_tva_rates" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_company" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_issued" ON "invoices" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "idx_mp_clicks_classified" ON "marketplace_clicks" USING btree ("classified_id");--> statement-breakpoint
CREATE INDEX "idx_mp_clicks_clicked" ON "marketplace_clicks" USING btree ("clicked_at");--> statement-breakpoint
CREATE INDEX "idx_msg_conv_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_news_published" ON "news_articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_news_category" ON "news_articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_notif_user_created" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_notif_user_read" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "idx_docs_order" ON "order_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_docs_type" ON "order_documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_pos_order_recorded" ON "order_positions" USING btree ("order_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_order_stops_order" ON "order_stops" USING btree ("order_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_share_order" ON "order_tracking_shares" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_client" ON "orders" USING btree ("client_user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_carrier" ON "orders" USING btree ("carrier_user_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payments_company" ON "payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_payments_invoice" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payments_status" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pos_sale_lines_sale" ON "pos_sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_pos_sales_company" ON "pos_sales" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_pos_sales_created" ON "pos_sales" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tracking_order" ON "public_tracking_tokens" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_tracking_scope" ON "public_tracking_tokens" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_push_subs_user" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ratings_order_from" ON "ratings" USING btree ("order_id","from_user_id");--> statement-breakpoint
CREATE INDEX "idx_reception_lines_reception" ON "reception_lines" USING btree ("reception_id");--> statement-breakpoint
CREATE INDEX "idx_receptions_company" ON "receptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_user" ON "route_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_alerts_type_active" ON "route_alerts" USING btree ("type","is_active");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_site_banner_active" ON "site_banner" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_levels_wh_product" ON "stock_levels" USING btree ("warehouse_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_levels_company" ON "stock_levels" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_stock_moves_company" ON "stock_movements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_stock_moves_product" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_moves_ref" ON "stock_movements" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_company" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_status" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_expires" ON "subscriptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_suppliers_company" ON "suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_tacho_company" ON "tachograph_files" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_tacho_driver" ON "tachograph_files" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_totp_pending_user" ON "totp_pending_logins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_totp_pending_expires" ON "totp_pending_logins" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_dossiers_company" ON "transport_dossiers" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_status" ON "transport_dossiers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_dossiers_freight" ON "transport_dossiers" USING btree ("freight_id");--> statement-breakpoint
CREATE INDEX "idx_dossiers_carrier" ON "transport_dossiers" USING btree ("assigned_carrier_company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_lines_invoice" ON "transport_invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_payments_invoice" ON "transport_invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transport_invoices_full" ON "transport_invoices" USING btree ("company_id","full_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transport_invoices_share" ON "transport_invoices" USING btree ("share_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transport_invoices_series_seq" ON "transport_invoices" USING btree ("series_id","sequence_number");--> statement-breakpoint
CREATE INDEX "idx_transport_invoices_company" ON "transport_invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_transport_invoices_status" ON "transport_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transport_invoices_kind" ON "transport_invoices" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_transport_invoices_due" ON "transport_invoices" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "idx_transport_invoices_order" ON "transport_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_truck_docs_truck" ON "truck_documents" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "idx_truck_positions_company" ON "truck_positions" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_trucks_company" ON "trucks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_membership_user" ON "user_company_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_membership_company" ON "user_company_memberships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_users_company" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_users_type" ON "users" USING btree ("user_type");--> statement-breakpoint
CREATE INDEX "idx_users_referral_code" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "idx_users_referred_by" ON "users" USING btree ("referred_by_user_id");--> statement-breakpoint
CREATE INDEX "idx_users_founder" ON "users" USING btree ("is_founder");--> statement-breakpoint
CREATE INDEX "idx_waitlist_email" ON "waitlist_signups" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_waitlist_created" ON "waitlist_signups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_waitlist_company_type" ON "waitlist_signups" USING btree ("company_type");--> statement-breakpoint
CREATE INDEX "idx_warehouses_company" ON "warehouses" USING btree ("company_id");