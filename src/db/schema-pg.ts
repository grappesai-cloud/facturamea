import { pgTable, text, integer, boolean, timestamp, serial, varchar, doublePrecision, primaryKey, index, uniqueIndex, jsonb, date, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ─── Users & Auth ──────────────────────────────────────────

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  platformId: varchar('platform_id', { length: 20 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  emailVerified: boolean('email_verified').default(false),
  hashedPassword: text('hashed_password').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  userType: varchar('user_type', { length: 50 }).notNull(), // transportator, intermediar, client_direct, partener, admin
  isAdmin: boolean('is_admin').default(false),
  // FK to companies (nullable); SET NULL on company delete so a company removal
  // doesn't cascade-delete its users.
  companyId: text('company_id').references(() => companies.id, { onDelete: 'set null' }),
  parentUserId: text('parent_user_id'),
  avatarUrl: text('avatar_url'),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').default(true),
  // 2FA / TOTP (RFC 6238). Secret is stored base32-encoded.
  totpSecret: text('totp_secret'),
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  totpRecoveryCodes: text('totp_recovery_codes'), // JSON array of bcrypt hashes
  totpEnrolledAt: timestamp('totp_enrolled_at'),
  // GDPR soft-delete — daily cron hard-deletes after 30 days
  deletedAt: timestamp('deleted_at'),
  // Referral program
  referralCode: varchar('referral_code', { length: 20 }).unique(),
  referredByUserId: text('referred_by_user_id'),
  referralBonusPaid: boolean('referral_bonus_paid').notNull().default(false),
  // Founding member program: 1-999 (asociație + 100€ donors). NULL for regular users.
  // Founder IDs render as TH-001 .. TH-999; regular users render as TH-10000+.
  isFounder: boolean('is_founder').notNull().default(false),
  founderNumber: integer('founder_number').unique(),
  // Set the first time the user dismisses the welcome tour. Persistent so the tour
  // never re-appears across browsers / devices, even if localStorage is cleared.
  onboardingSeenAt: timestamp('onboarding_seen_at'),
  // JSON array of dashboard module keys the user pinned/ordered (new FE).
  dashboardModules: text('dashboard_modules'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_users_company').on(table.companyId),
  index('idx_users_type').on(table.userType),
  index('idx_users_referral_code').on(table.referralCode),
  index('idx_users_referred_by').on(table.referredByUserId),
  index('idx_users_founder').on(table.isFounder),
]);

// Short-lived (5 min) handle issued when password is correct but TOTP is required.
// Client posts this handle + 6-digit code to /api/auth/totp/verify to complete login.
export const totpPendingLogins = pgTable('totp_pending_logins', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_totp_pending_user').on(table.userId),
  index('idx_totp_pending_expires').on(table.expiresAt),
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_sessions_user').on(table.userId),
  index('idx_sessions_expires').on(table.expiresAt),
]);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  token: text('token').unique().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Companies ─────────────────────────────────────────────

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  cui: varchar('cui', { length: 50 }),
  country: varchar('country', { length: 100 }).notNull(),
  city: varchar('city', { length: 200 }),
  address: text('address'),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  website: varchar('website', { length: 500 }),
  description: text('description'),
  logoUrl: text('logo_url'),
  subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free'),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  isVerified: boolean('is_verified').default(false),
  ratingAvg: doublePrecision('rating_avg').default(0),
  ratingCount: integer('rating_count').default(0),
  // KYC light: 'none' | 'pending' | 'verified' | 'rejected'
  kycStatus: varchar('kyc_status', { length: 20 }),
  kycSubmittedAt: timestamp('kyc_submitted_at'),
  kycReviewedAt: timestamp('kyc_reviewed_at'),
  kycReviewerId: text('kyc_reviewer_id'),
  kycRejectionReason: text('kyc_rejection_reason'),
  // Stripe customer ID (set on first checkout, reused thereafter)
  stripeCustomerId: text('stripe_customer_id'),
  // Invoicing module v2 — per-company branding + TVA-la-încasare regime.
  invoiceLogoUrl: text('invoice_logo_url'),
  invoiceStampUrl: text('invoice_stamp_url'),
  invoiceSignatureUrl: text('invoice_signature_url'),
  invoiceFooterText: text('invoice_footer_text'),
  tvaAtCollection: boolean('tva_at_collection').default(false),
  // VAT-payer status (plătitor TVA) — captured from ANAF at onboarding. Non-payers
  // issue invoices without VAT and their e-Factura must NOT declare a VAT scheme.
  isVatPayer: boolean('is_vat_payer'),
  // e-Factura: when true, every issued invoice is auto-submitted to ANAF SPV on creation.
  efacturaAutoSend: boolean('efactura_auto_send').default(false),
  // Automated payment reminders (dunning) to clients.
  dunningEnabled: boolean('dunning_enabled').default(false),
  // Inventory cost method: cmp (weighted avg) | fifo | lifo.
  costMethod: varchar('cost_method', { length: 8 }).default('cmp'),
  // Payment-behavior engine — rolled up from invoice scadență vs. paidAt.
  // paymentScore 0..100 ("Payment Reliability Score"); recomputed by the daily
  // cron + after every chitanță. avgDaysToPay = mean delay (issue→paid),
  // negative = pays early. paymentIncidentCount = confirmed unpaid disputes.
  paymentScore: integer('payment_score'),
  avgDaysToPay: doublePrecision('avg_days_to_pay'),
  paymentIncidentCount: integer('payment_incident_count').default(0),
  paymentScoreUpdatedAt: timestamp('payment_score_updated_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_companies_cui').on(table.cui),
  index('idx_companies_country').on(table.country),
  index('idx_companies_verified').on(table.isVerified),
]);

// ─── Cities (European) ────────────────────────────────────

// ─── Truck Types ──────────────────────────────────────────

export const truckTypes = pgTable('truck_types', {
  id: varchar('id', { length: 50 }).primaryKey(),
  nameRo: varchar('name_ro', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }),
  icon: varchar('icon', { length: 50 }),
  sortOrder: integer('sort_order').default(0),
});

// ─── Freight ──────────────────────────────────────────────

// Note: index on freight.postedBy + auctions.postedBy etc. added in 0004 migration directly.
export const freight = pgTable('freight', {
  id: text('id').primaryKey(),
  // Public sequential ID shown in UI/URLs (10000+). NULL only for legacy rows pre-migration.
  displayId: integer('display_id').unique(),
  postedBy: text('posted_by').notNull().references(() => users.id),
  companyId: text('company_id').notNull().references(() => companies.id),
  status: varchar('status', { length: 20 }).default('active'),
  loadingCityId: integer('loading_city_id'),
  loadingCityName: varchar('loading_city_name', { length: 500 }).notNull(),
  loadingCountry: varchar('loading_country', { length: 10 }).notNull(),
  loadingPostal: varchar('loading_postal', { length: 20 }),
  loadingLat: doublePrecision('loading_lat'),
  loadingLng: doublePrecision('loading_lng'),
  unloadingCityId: integer('unloading_city_id'),
  unloadingCityName: varchar('unloading_city_name', { length: 500 }).notNull(),
  unloadingCountry: varchar('unloading_country', { length: 10 }).notNull(),
  unloadingPostal: varchar('unloading_postal', { length: 20 }),
  unloadingLat: doublePrecision('unloading_lat'),
  unloadingLng: doublePrecision('unloading_lng'),
  loadingDate: date('loading_date', { mode: 'string' }).notNull(),
  loadingDateEnd: date('loading_date_end', { mode: 'string' }),
  weight: doublePrecision('weight'),
  volume: doublePrecision('volume'),
  // Required floor length (LDM — loading meters). Used for partial loads / mixed cargo.
  floorMeters: doublePrecision('floor_meters'),
  quantity: integer('quantity').default(1),
  description: text('description'),
  distanceKm: integer('distance_km'),
  isFullTruck: boolean('is_full_truck').default(true),
  isRoundTrip: boolean('is_round_trip').default(false),
  pricePerKm: doublePrecision('price_per_km'),
  priceTotal: doublePrecision('price_total'),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  includesTva: boolean('includes_tva').default(false),
  // 'spot' (single shipment) | 'long_term' (recurring / contract)
  contractType: varchar('contract_type', { length: 20 }).default('spot'),
  contractMonths: integer('contract_months'),
  contractFrequency: varchar('contract_frequency', { length: 30 }),
  // 'ftl' (full truckload) | 'ltl' (groupage / partial)
  freightMode: varchar('freight_mode', { length: 10 }).default('ftl'),
  // Payment term in days from delivery
  paymentTermDays: integer('payment_term_days'),
  // ADR class (when ADR=true): 1-9
  adrClass: varchar('adr_class', { length: 10 }),
  // Container type (when applicable): 20ft, 40ft, 45ft
  containerType: varchar('container_type', { length: 20 }),
  // Number of vehicles (for auto transport)
  vehicleCount: integer('vehicle_count'),
  // Premium "evidențiat" listing (paid promotion)
  isFeatured: boolean('is_featured').default(false),
  // Auction mode: when true, listing accepts bids and hides phone publicly.
  // Bidders see a traffic-light position (green=1st, yellow=top3, red=4+).
  isAuction: boolean('is_auction').notNull().default(false),
  auctionEndsAt: timestamp('auction_ends_at'),
  // Optional extra pickup/delivery stops. Primary loading/unloading remain in
  // the canonical columns above. Each entry: { kind: 'pickup'|'delivery',
  // cityName, country, postal?, lat?, lng?, date?, notes? }
  extraStops: jsonb('extra_stops'),
  expiresAt: timestamp('expires_at'),
  viewCount: integer('view_count').default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_freight_status').on(table.status),
  index('idx_freight_loading').on(table.loadingCountry, table.loadingCityName),
  index('idx_freight_unloading').on(table.unloadingCountry, table.unloadingCityName),
  index('idx_freight_date').on(table.loadingDate),
  index('idx_freight_company').on(table.companyId),
  index('idx_freight_contract_type').on(table.contractType),
  index('idx_freight_featured').on(table.isFeatured),
  index('idx_freight_posted_by').on(table.postedBy),
  index('idx_freight_deleted_at').on(table.deletedAt),
]);

// ─── Orders (Comenzi) ─────────────────────────────────────

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  orderNumber: varchar('order_number', { length: 50 }).unique().notNull(),
  freightId: text('freight_id').notNull().references(() => freight.id),

  // Parties
  clientUserId: text('client_user_id').notNull().references(() => users.id),
  clientCompanyId: text('client_company_id').notNull().references(() => companies.id),
  carrierUserId: text('carrier_user_id').references(() => users.id),
  carrierCompanyId: text('carrier_company_id').references(() => companies.id),
  carrierPlatformId: varchar('carrier_platform_id', { length: 20 }),

  // Vehicle + driver supplied by the carrier at accept time. Plate is required
  // (selected from the carrier's fleet); driver name/phone are optional.
  vehiclePlate: varchar('vehicle_plate', { length: 50 }),
  driverName: varchar('driver_name', { length: 120 }),
  driverPhone: varchar('driver_phone', { length: 40 }),

  // Status: open -> accepted -> loaded -> in_transit -> delivered -> closed
  // (or open -> refused if the carrier declines)
  status: varchar('status', { length: 20 }).default('open'),

  // Timestamps
  assignedAt: timestamp('assigned_at'),
  acceptedAt: timestamp('accepted_at'),
  loadedAt: timestamp('loaded_at'),
  deliveredAt: timestamp('delivered_at'),
  closedAt: timestamp('closed_at'),

  // CMR
  cmrPhotoUrl: text('cmr_photo_url'),
  cmrUploadedAt: timestamp('cmr_uploaded_at'),

  // Custom clauses (JSON)
  clauses: text('clauses'),

  // Notes
  clientNotes: text('client_notes'),
  carrierNotes: text('carrier_notes'),

  // Insurance addon (chosen at booking)
  insuranceChosen: boolean('insurance_chosen').notNull().default(false),
  insuranceProvider: varchar('insurance_provider', { length: 80 }),
  insurancePremium: doublePrecision('insurance_premium'),
  insuranceCoverage: doublePrecision('insurance_coverage'),

  // Carbon footprint (kg CO2 estimate)
  co2Kg: doublePrecision('co2_kg'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_orders_client').on(table.clientUserId),
  index('idx_orders_carrier').on(table.carrierUserId),
  index('idx_orders_status').on(table.status),
]);

// ─── Ratings ───────────────────────────────────────────────

export const ratings = pgTable('ratings', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  fromUserId: text('from_user_id').notNull().references(() => users.id),
  toUserId: text('to_user_id').notNull().references(() => users.id),
  toCompanyId: text('to_company_id').notNull().references(() => companies.id),
  score: integer('score').notNull(), // overall 1..5 (kept for backwards compat)
  // Granular dimensions, each 1..5 (null if skipped)
  punctuality: integer('punctuality'),
  communication: integer('communication'),
  cargoCondition: integer('cargo_condition'),
  documentation: integer('documentation'),
  paymentReliability: integer('payment_reliability'),
  comment: text('comment'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  // One rating per (order, rater) — blocks repeated self-stacking ratings.
  uniqueIndex('uq_ratings_order_from').on(table.orderId, table.fromUserId),
]);

// ─── Company Badges ───────────────────────────────────────

// ─── Fleet (Trucks) ───────────────────────────────────────

export const trucks = pgTable('trucks', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id),
  addedBy: text('added_by').notNull().references(() => users.id),
  licensePlate: varchar('license_plate', { length: 50 }).notNull(),
  // 'truck' (motor vehicle) | 'semitrailer' | 'trailer' — parc auto can hold
  // both tractor units and the trailers/semitrailers they pull.
  vehicleClass: varchar('vehicle_class', { length: 20 }).notNull().default('truck'),
  truckTypeId: varchar('truck_type_id', { length: 50 }).references(() => truckTypes.id),
  brand: varchar('brand', { length: 100 }),
  model: varchar('model', { length: 100 }),
  year: integer('year'),
  maxWeight: doublePrecision('max_weight'),
  maxVolume: doublePrecision('max_volume'),
  euroClass: varchar('euro_class', { length: 20 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_trucks_company').on(table.companyId),
]);

// ─── Truck documents (per-vehicle papers with expiry: ITP, RCA, CASCO, …) ──
// ─── Truck live positions (latest GPS reading per fleet vehicle) ──────────
// One row per truck, upserted by the fleet GPS sync (matched device↔truck by
// plate). Powers the Parc auto map + live status, independent of orders.
// ─── Available Trucks (Camioane disponibile) ──────────────

// ─── Saved Routes ─────────────────────────────────────────

// ─── Classifieds (Mica Publicitate) ───────────────────────

export const classifieds = pgTable('classifieds', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  companyId: text('company_id').references(() => companies.id),
  category: varchar('category', { length: 50 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description').notNull(),
  price: doublePrecision('price'),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  locationCity: varchar('location_city', { length: 500 }),
  locationCountry: varchar('location_country', { length: 10 }),
  contactPhone: varchar('contact_phone', { length: 50 }),
  contactName: varchar('contact_name', { length: 255 }),
  status: varchar('status', { length: 20 }).default('active'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_classifieds_category').on(table.category),
  index('idx_classifieds_status').on(table.status),
]);

// ─── Forum ─────────────────────────────────────────────────

// ─── Auctions (Licitații) ─────────────────────────────────

// ─── Conversations & Messages ─────────────────────────────

// ─── Notifications ────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Type examples: 'auction_bid', 'auction_won', 'auction_lost', 'order_status',
  //                'message', 'freight_match', 'incident', 'system'
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body'),
  // Deep link target
  linkUrl: varchar('link_url', { length: 500 }),
  // Related entity for filtering
  entityType: varchar('entity_type', { length: 30 }),
  entityId: text('entity_id'),
  readAt: timestamp('read_at'),
  // Email delivery status (null = not attempted)
  emailSentAt: timestamp('email_sent_at'),
  emailError: text('email_error'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_notif_user_created').on(table.userId, table.createdAt),
  index('idx_notif_user_read').on(table.userId, table.readAt),
]);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  // Per-channel master switches
  emailEnabled: boolean('email_enabled').default(true),
  inAppEnabled: boolean('in_app_enabled').default(true),
  // Per-type overrides (JSON of { type: { email: bool, inApp: bool } })
  typeOverrides: text('type_overrides'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Route-based saved-search alerts (e.g. "orice marfă București → Cluj")
// ─── Order Positions (Live Tracking) ──────────────────────

// ─── Order stops: per-point loading/unloading tracking ──────────────────
// One row per loading or unloading point of an order (primary + extra stops),
// so the carrier can mark "ajuns" / "încărcat/descărcat" at each and the
// expeditor sees granular progress (loading 1/2/3, unloading 1/2/3).
// ─── GPS / Telematics integrations (pull providers, e.g. CargoTrack) ──
// One row per company per provider. Credentials are stored AES-256-GCM
// encrypted (see src/lib/crypto.ts). We poll the provider on demand (while
// someone watches an order map) and via cron, then write into order_positions.
export const gpsIntegrations = pgTable('gps_integrations', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 30 }).notNull().default('cargotrack'),
  // Human-readable label (primary identifier field, e.g. account/login/db).
  username: varchar('username', { length: 255 }),
  // Legacy single-secret column (CargoTrack-era). New code uses configEnc.
  passwordEnc: text('password_enc'),
  // AES-256-GCM encrypted JSON of all provider-specific credentials.
  configEnc: text('config_enc'),
  isActive: boolean('is_active').default(true),
  lastSyncAt: timestamp('last_sync_at'),
  lastSyncStatus: varchar('last_sync_status', { length: 20 }), // 'ok'|'auth'|'rate_limited'|'error'
  lastError: text('last_error'),
  deviceCount: integer('device_count'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('idx_gps_company_provider').on(table.companyId, table.provider),
]);

// ─── Order Documents ──────────────────────────────────────

// ─── Incidents & Claims ───────────────────────────────────

export const incidents = pgTable('incidents', {
  id: text('id').primaryKey(),
  orderId: text('order_id').references(() => orders.id),
  reporterUserId: text('reporter_user_id').notNull().references(() => users.id),
  reporterCompanyId: text('reporter_company_id').notNull().references(() => companies.id),
  againstCompanyId: text('against_company_id').notNull().references(() => companies.id),
  againstUserId: text('against_user_id').references(() => users.id),
  // 'damaged_cargo' | 'late_delivery' | 'no_show' | 'payment_delay' | 'document_issue' | 'fraud' | 'other'
  category: varchar('category', { length: 40 }).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  // Claimed amount (optional, for financial claims)
  claimedAmount: doublePrecision('claimed_amount'),
  currency: varchar('currency', { length: 5 }),
  // Public: visible on the against_company profile
  isPublic: boolean('is_public').default(false),
  // Status: 'open' -> 'responded' -> 'resolved' | 'rejected' | 'escalated'
  status: varchar('status', { length: 20 }).default('open'),
  adminReviewedBy: text('admin_reviewed_by').references(() => users.id),
  adminReviewedAt: timestamp('admin_reviewed_at'),
  adminNotes: text('admin_notes'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_incidents_against').on(table.againstCompanyId, table.isPublic),
  index('idx_incidents_reporter').on(table.reporterCompanyId),
  index('idx_incidents_status').on(table.status),
]);

// ─── Company Blacklist ────────────────────────────────────

// ─── Company Locations (HQ, depozite, puncte de lucru) ───

export const companyLocations = pgTable('company_locations', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'hq' | 'office' | 'warehouse' | 'parking' | 'loading_point'
  type: varchar('type', { length: 30 }).notNull().default('office'),
  name: varchar('name', { length: 200 }).notNull(),
  countryCode: varchar('country_code', { length: 5 }).notNull(),
  city: varchar('city', { length: 200 }).notNull(),
  address: text('address'),
  postalCode: varchar('postal_code', { length: 20 }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  phone: varchar('phone', { length: 50 }),
  contactName: varchar('contact_name', { length: 200 }),
  openingHours: text('opening_hours'),
  notes: text('notes'),
  isPrimary: boolean('is_primary').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_locations_company').on(table.companyId),
  index('idx_locations_type').on(table.type),
]);

// ─── Transport Clauses ────────────────────────────────────

export const transportClauses = pgTable('transport_clauses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  isDefault: boolean('is_default').default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_transport_clauses_company').on(table.companyId),
]);

// ─── Favorites ────────────────────────────────────────────

// ─── Freight Bids (offers on regular freight, not auctions) ──

// ─── Documents ────────────────────────────────────────────

export const companyDocuments = pgTable('company_documents', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'cui_cert' | 'onrc_cert' | 'transport_license' | 'community_license' | 'cmr_insurance' | 'cmr_carnet' | 'cemt' | 'iso_cert' | 'other'
  type: varchar('type', { length: 40 }).notNull(),
  name: varchar('name', { length: 300 }).notNull(),
  url: text('url').notNull(), // stored on Vercel Blob
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  // Validity period for documents that expire (insurance, licenses)
  issuedAt: varchar('issued_at', { length: 20 }),
  expiresAt: varchar('expires_at', { length: 20 }),
  notes: text('notes'),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_company_documents_company').on(table.companyId),
  index('idx_company_documents_expires').on(table.expiresAt),
]);

// ─── Subscriptions & Billing ──────────────────────────────

export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  // 'flexibil' | 'sprinter' | 'caraus' | 'premium'
  code: varchar('code', { length: 30 }).notNull().unique(),
  nameRo: varchar('name_ro', { length: 100 }).notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  // For each period in months (1, 3, 6, 12) — storing one plan = one billing cycle
  periodMonths: integer('period_months').notNull(),
  priceCents: integer('price_cents').notNull(), // in EUR cents
  // Limits
  maxFreightPosts: integer('max_freight_posts'), // null = unlimited
  maxTruckPosts: integer('max_truck_posts'),
  maxAuctions: integer('max_auctions'),
  maxUsers: integer('max_users'),
  maxLocations: integer('max_locations'),
  features: text('features'), // JSON array of feature flags
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull().references(() => plans.id),
  // 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
  status: varchar('status', { length: 20 }).default('trial'),
  startedAt: timestamp('started_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  cancelledAt: timestamp('cancelled_at'),
  autoRenew: boolean('auto_renew').default(true),
  trialUntil: timestamp('trial_until'),
  paymentMethodId: text('payment_method_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_subscriptions_company').on(table.companyId),
  index('idx_subscriptions_status').on(table.status),
  index('idx_subscriptions_expires').on(table.expiresAt),
]);

export const billingAddresses = pgTable('billing_addresses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  legalName: varchar('legal_name', { length: 300 }).notNull(),
  cui: varchar('cui', { length: 50 }),
  regCom: varchar('reg_com', { length: 50 }),
  iban: varchar('iban', { length: 50 }),
  bank: varchar('bank', { length: 200 }),
  address: text('address').notNull(),
  city: varchar('city', { length: 200 }).notNull(),
  countryCode: varchar('country_code', { length: 5 }).notNull(),
  postalCode: varchar('postal_code', { length: 20 }),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_billing_addresses_company').on(table.companyId),
]);

export const paymentMethods = pgTable('payment_methods', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'card' | 'transfer' | 'paypal'
  type: varchar('type', { length: 20 }).notNull(),
  // For card: last 4 + brand + exp month/year (no PCI data stored — token only)
  brand: varchar('brand', { length: 30 }),
  last4: varchar('last4', { length: 8 }),
  expMonth: integer('exp_month'),
  expYear: integer('exp_year'),
  // External provider token (Stripe pm_xxx, etc.)
  providerToken: text('provider_token'),
  provider: varchar('provider', { length: 30 }),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_payment_methods_company').on(table.companyId),
]);

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  subscriptionId: text('subscription_id').references(() => subscriptions.id),
  // 'draft' | 'issued' | 'paid' | 'overdue' | 'voided'
  status: varchar('status', { length: 20 }).default('issued'),
  amountCents: integer('amount_cents').notNull(),
  vatCents: integer('vat_cents').default(0),
  totalCents: integer('total_cents').notNull(),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  issuedAt: timestamp('issued_at').defaultNow(),
  dueAt: timestamp('due_at'),
  paidAt: timestamp('paid_at'),
  pdfUrl: text('pdf_url'),
  // External RO invoicing system reference (SmartBill / Oblio)
  providerRef: varchar('provider_ref', { length: 100 }),
  // e-Factura ANAF SPV submission
  efacturaXml: text('efactura_xml'),
  // 'pending' | 'submitted' | 'accepted' | 'rejected'
  efacturaStatus: varchar('efactura_status', { length: 20 }),
  efacturaSubmittedAt: timestamp('efactura_submitted_at'),
  efacturaAnafId: text('efactura_anaf_id'),
  efacturaError: text('efactura_error'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoices_company').on(table.companyId),
  index('idx_invoices_status').on(table.status),
  index('idx_invoices_issued').on(table.issuedAt),
]);

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  // 'pending' | 'succeeded' | 'failed' | 'refunded'
  status: varchar('status', { length: 20 }).default('pending'),
  paymentMethodId: text('payment_method_id').references(() => paymentMethods.id),
  provider: varchar('provider', { length: 30 }), // 'stripe' | 'netopia' | 'transfer'
  providerTxId: varchar('provider_tx_id', { length: 200 }),
  errorMessage: text('error_message'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_payments_company').on(table.companyId),
  index('idx_payments_invoice').on(table.invoiceId),
  index('idx_payments_status').on(table.status),
]);

export const coupons = pgTable('coupons', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  // 'percent' | 'fixed'
  discountType: varchar('discount_type', { length: 10 }).notNull(),
  discountValue: integer('discount_value').notNull(), // percent (1-100) or cents
  description: text('description'),
  maxRedemptions: integer('max_redemptions'),
  redemptionCount: integer('redemption_count').default(0),
  validFrom: timestamp('valid_from'),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ─── Company Licenses & Verifications ─────────────────────

export const companyLicenses = pgTable('company_licenses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'arr_transport' | 'community_license' | 'iru_carnet' | 'cemt'
  type: varchar('type', { length: 40 }).notNull(),
  number: varchar('number', { length: 100 }).notNull(),
  issuedBy: varchar('issued_by', { length: 200 }),
  issuedAt: varchar('issued_at', { length: 20 }),
  expiresAt: varchar('expires_at', { length: 20 }),
  // 'active' | 'expired' | 'revoked' | 'pending'
  status: varchar('status', { length: 20 }).default('active'),
  // Last automatic verification (ARR/ANAF check)
  verifiedAt: timestamp('verified_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_company_licenses_company').on(table.companyId),
  index('idx_company_licenses_expires').on(table.expiresAt),
]);

// ─── Multi-tenant: user can belong to multiple companies ──

export const userCompanyMemberships = pgTable('user_company_memberships', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'owner' | 'admin' | 'member'
  role: varchar('role', { length: 20 }).default('member'),
  // Default company for this user (only one row should be default)
  isDefault: boolean('is_default').default(false),
  joinedAt: timestamp('joined_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.companyId] }),
  index('idx_membership_user').on(table.userId),
  index('idx_membership_company').on(table.companyId),
]);

// ─── Notifications: news/announcements (CMS-light) ────────

export const newsArticles = pgTable('news_articles', {
  id: text('id').primaryKey(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  // Multilingual title/body
  titleRo: varchar('title_ro', { length: 500 }).notNull(),
  titleEn: varchar('title_en', { length: 500 }),
  bodyRo: text('body_ro').notNull(),
  bodyEn: text('body_en'),
  category: varchar('category', { length: 50 }), // 'announcement' | 'feature' | 'industry' | 'guide'
  coverImageUrl: text('cover_image_url'),
  publishedAt: timestamp('published_at'),
  isPublished: boolean('is_published').default(false),
  viewCount: integer('view_count').default(0),
  authorUserId: text('author_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_news_published').on(table.publishedAt),
  index('idx_news_category').on(table.category),
]);

// ─── Credits System (CRB — facturamea Credits) ──────────

export const creditBalances = pgTable('credit_balances', {
  companyId: text('company_id').primaryKey().references(() => companies.id, { onDelete: 'cascade' }),
  balance: integer('balance').default(0), // în CRB
  totalPurchased: integer('total_purchased').default(0),
  totalConsumed: integer('total_consumed').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  // lib/credits.ts assumes a non-negative balance invariant — enforce it at the DB level.
  check('chk_credit_balance_nonneg', sql`${table.balance} >= 0`),
]);

export const servicesCatalog = pgTable('services_catalog', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 50 }).unique().notNull(),
  nameRo: varchar('name_ro', { length: 200 }).notNull(),
  nameEn: varchar('name_en', { length: 200 }),
  descriptionRo: text('description_ro'),
  descriptionEn: text('description_en'),
  priceCrb: doublePrecision('price_crb').notNull(),
  priceLei: doublePrecision('price_lei'),
  category: varchar('category', { length: 50 }), // 'extra_user', 'premium_day', 'consult', 'incident_declare', 'featured_listing', 'classified', 'company_report', 'sms_notif'
  isActive: boolean('is_active').default(true),
  sortOrder: integer('sort_order').default(0),
});

export const creditTransactions = pgTable('credit_transactions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  type: varchar('type', { length: 20 }).notNull(), // 'purchase' | 'consume' | 'refund' | 'bonus'
  serviceCode: varchar('service_code', { length: 50 }),
  amountCrb: integer('amount_crb').notNull(), // pozitiv pentru purchase/refund/bonus, negativ pentru consume
  balanceAfter: integer('balance_after').notNull(),
  reference: text('reference'),
  metadata: text('metadata'), // JSON
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_credit_tx_company').on(table.companyId),
  index('idx_credit_tx_created').on(table.createdAt),
]);

// ─── Invoice Guarantees (Garanție factură transport) ──────

// ─── Drivers + Driver Certificates ───────────────────────

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  cnp: varchar('cnp', { length: 20 }),
  licenseNumber: varchar('license_number', { length: 50 }),
  licenseCategories: varchar('license_categories', { length: 50 }), // "B,C,CE,D"
  licenseExpiresAt: timestamp('license_expires_at'),
  cardTachoNumber: varchar('card_tacho_number', { length: 50 }),
  cardTachoExpiresAt: timestamp('card_tacho_expires_at'),
  cqcExpiresAt: timestamp('cqc_expires_at'), // CPC / atestat
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  hireDate: timestamp('hire_date'),
  isActive: boolean('is_active').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_drivers_company').on(table.companyId),
]);

// ─── Info articles (Informatii hub: reglementări/formulare/publicații) ──

// ─── Verify Contact (anti-fraud lookup) ──────────────────

// ─── Audit Log ────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  // SET NULL on user delete so GDPR hard-delete of a user is not blocked by audit rows.
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  companyId: text('company_id'),
  action: varchar('action', { length: 80 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: text('entity_id'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  metadata: text('metadata'), // JSON string
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_audit_user').on(table.userId),
  index('idx_audit_action').on(table.action),
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_created').on(table.createdAt),
]);

// ─── Waitlist Signups (early-access lead capture) ─────────
// Pre-launch lead capture from landing page. Notified by email when the
// platform goes live; converted to a real account via /auth/register at that point.
// ─── Admin tooling ───────────────────────────────────────

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  rolloutPercent: integer('rollout_percent').notNull().default(100),
  description: text('description'),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
});

export const siteBanner = pgTable('site_banner', {
  id: text('id').primaryKey(),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 20 }).notNull().default('info'),
  active: boolean('active').notNull().default(false),
  startsAt: timestamp('starts_at'),
  endsAt: timestamp('ends_at'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by'),
}, (table) => [index('idx_site_banner_active').on(table.active)]);

export const broadcasts = pgTable('broadcasts', {
  id: text('id').primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  segment: varchar('segment', { length: 40 }).notNull(),
  sendEmail: boolean('send_email').notNull().default(false),
  recipientsCount: integer('recipients_count'),
  sentAt: timestamp('sent_at').defaultNow(),
  sentBy: text('sent_by'),
});

// ─── CMR digital signatures ──────────────────────────────

// ─── Web Push (VAPID) subscriptions ──────────────────────
// One user may have many endpoints (laptop, phone, work). The endpoint
// URL is its own primary key. Subscriptions auto-expire when the
// browser revokes; we track consecutiveFailures to evict dead ones.

export const pushSubscriptions = pgTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  p256dh: text('p256dh').notNull(),
  authKey: text('auth_key').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  lastError: text('last_error'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
}, (table) => [index('idx_push_subs_user').on(table.userId)]);

// Native push device tokens (APNs / FCM) for the Capacitor iOS/Android apps.
// Distinct from push_subscriptions (web-push VAPID, which doesn't work in a
// native WKWebView). One row per device token.
export const deviceTokens = pgTable('device_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId: text('company_id'),
  platform: varchar('platform', { length: 12 }).notNull(), // 'ios' | 'android'
  token: text('token').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  lastSeenAt: timestamp('last_seen_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_device_token').on(table.token),
  index('idx_device_tokens_user').on(table.userId),
]);

// ─── HOS / AETR driver hours ─────────────────────────────

// ─── ANAF OAuth connections (e-Factura, e-Transport) ────
// Per-company OAuth tokens for ANAF SPV API. Each company connects
// independently via the OAuth flow at logincert.anaf.ro. Tokens are
// AES-256-GCM encrypted at rest with ANAF_ENCRYPTION_KEY.
// Access token: ~90 days. Refresh token: ~365 days.

export const anafConnections = pgTable('anaf_connections', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 32 }).notNull(), // 'e-factura' | 'e-transport' | 'spv'
  cif: varchar('cif', { length: 20 }), // CIF returned by ANAF on the authenticated cert
  accessTokenEnc: text('access_token_enc').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  accessExpiresAt: timestamp('access_expires_at').notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at').notNull(),
  connectedByUserId: text('connected_by_user_id').notNull().references(() => users.id),
  connectedAt: timestamp('connected_at').notNull().defaultNow(),
  lastRefreshedAt: timestamp('last_refreshed_at'),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
}, (table) => [
  uniqueIndex('uniq_anaf_company_scope').on(table.companyId, table.scope),
  index('idx_anaf_access_expires').on(table.accessExpiresAt),
]);

// Short-lived state nonce for the OAuth flow (CSRF protection +
// userId/companyId/scope continuity across the redirect to ANAF).
export const anafOauthStates = pgTable('anaf_oauth_states', {
  state: text('state').primaryKey(),
  companyId: text('company_id').notNull(),
  userId: text('user_id').notNull(),
  scope: varchar('scope', { length: 32 }).notNull(),
  redirectAfter: text('redirect_after'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

// Audit log for every ANAF API call that has fiscal effect (UIT
// declarations, invoice uploads, message reads, cancels). Lets us
// reconcile platform state with ANAF state and prove submissions.
export const anafSubmissions = pgTable('anaf_submissions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  scope: varchar('scope', { length: 32 }).notNull(), // 'e-factura' | 'e-transport'
  action: varchar('action', { length: 40 }).notNull(), // declare-uit | upload-invoice | cancel-uit | message-list | message-download
  refType: varchar('ref_type', { length: 32 }), // 'order' | 'invoice'
  refId: text('ref_id'),
  uit: varchar('uit', { length: 64 }),
  spvIndex: text('spv_index'), // index_incarcare returned by ANAF
  status: varchar('status', { length: 32 }).notNull().default('pending'), // pending | sent | accepted | rejected | error
  errorMessage: text('error_message'),
  payload: jsonb('payload'),
  response: jsonb('response'),
  createdByUserId: text('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('idx_anaf_subm_company').on(table.companyId),
  index('idx_anaf_subm_ref').on(table.refType, table.refId),
  index('idx_anaf_subm_uit').on(table.uit),
  index('idx_anaf_subm_created').on(table.createdAt),
]);

// ─── Tachograph file ingest ──────────────────────────────

// ─── Multi-currency FX ───────────────────────────────────

export const fxRates = pgTable('fx_rates', {
  baseCurrency: varchar('base_currency', { length: 5 }).notNull(),
  quoteCurrency: varchar('quote_currency', { length: 5 }).notNull(),
  rate: doublePrecision('rate').notNull(),
  fetchedAt: timestamp('fetched_at').notNull(),
  source: varchar('source', { length: 20 }).default('ecb'),
}, (table) => [primaryKey({ columns: [table.baseCurrency, table.quoteCurrency] })]);

// ─── Public tracking links ───────────────────────────────

// ─── Border crossings ────────────────────────────────────

// ─── Factoring — early payment marketplace ───────────────

// ─── Marketplace click tracking ──────────────────────────

// ─── Existing tables extensions ──────────────────────────
// (Schema additions for invoices, orders, companies are inline above
// where the original tables are declared — see invoices.efactura*,
// orders.insurance*/co2_kg, companies.kyc_*)

export const waitlistSignups = pgTable('waitlist_signups', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 40 }),
  companyName: varchar('company_name', { length: 200 }),
  // transportator | expeditie | client | partener
  companyType: varchar('company_type', { length: 30 }).notNull(),
  acceptedTc: boolean('accepted_tc').notNull().default(false),
  acceptedGdpr: boolean('accepted_gdpr').notNull().default(false),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
  thankYouSentAt: timestamp('thank_you_sent_at'),
  notifiedAt: timestamp('notified_at'),
}, (table) => [
  index('idx_waitlist_email').on(table.email),
  index('idx_waitlist_created').on(table.createdAt),
  index('idx_waitlist_company_type').on(table.companyType),
]);


// ─── Entity views (cine a vizualizat anunţul/licitaţia) ────
// Unique per (entityType, entityId, viewerUserId) — bump view_count pe re-views.

// ─── Invoicing module (transport invoices, separate from platform-billing
// `invoices` which is Stripe-driven). The user-facing invoicing system that
// expeditors / carriers use to bill their own clients.

// Per-company numbering series. A company can have multiple series (e.g. one
// for TH-platform orders, one for external clients) but invoice numbers are
// assigned sequentially within each series. The `default_for` field marks the
// preferred series per kind so emission is one-click.
export const invoiceSeries = pgTable('invoice_series', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  prefix: varchar('prefix', { length: 16 }).notNull(), // e.g. "TH" / "EXT" / "F"
  // 'factura' | 'proforma' | 'storno' | 'chitanta' — one series per document kind
  kind: varchar('kind', { length: 16 }).notNull(),
  nextNumber: integer('next_number').notNull().default(1),
  isDefault: boolean('is_default').notNull().default(false),
  // Optional scope — 'platform' (only TH orders) | 'external' (only external clients) | null = both
  scope: varchar('scope', { length: 16 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoice_series_company').on(table.companyId),
  // Partial unique (one default per company+kind) IS enforced via raw SQL appended
  // to the migration: uq_invoice_series_default ON (company_id, kind) WHERE is_default.
]);

// External clients — companies / persons not registered on facturamea but
// to whom this company issues invoices. Internal companies use the existing
// `companies` table directly via `transportInvoices.clientCompanyId`.
export const invoiceClients = pgTable('invoice_clients', {
  id: text('id').primaryKey(),
  ownerCompanyId: text('owner_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  taxId: varchar('tax_id', { length: 32 }), // CUI / VAT number
  isVatPayer: boolean('is_vat_payer').notNull().default(false),
  registryNumber: varchar('registry_number', { length: 50 }), // J40/.../...
  country: varchar('country', { length: 60 }).notNull().default('Romania'),
  county: varchar('county', { length: 60 }),
  city: varchar('city', { length: 80 }),
  address: text('address'),
  postalCode: varchar('postal_code', { length: 20 }),
  contactName: varchar('contact_name', { length: 120 }),
  email: varchar('email', { length: 160 }),
  phone: varchar('phone', { length: 32 }),
  iban: varchar('iban', { length: 40 }),
  bank: varchar('bank', { length: 80 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoice_clients_owner').on(table.ownerCompanyId),
  index('idx_invoice_clients_tax').on(table.taxId),
]);

// PDF layout templates — at minimum we ship two ('classic' / 'accent') and let
// the user tweak brand color, logo, and footer text.
export const invoiceModels = pgTable('invoice_models', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  layoutKey: varchar('layout_key', { length: 24 }).notNull().default('classic'), // 'classic' | 'accent'
  brandColor: varchar('brand_color', { length: 16 }).default('#0A0A0A'),
  logoUrl: text('logo_url'),
  footerText: text('footer_text'),
  // Display toggles mirrored from the Oblio "Model factură" options panel.
  showQr: boolean('show_qr').notNull().default(false),          // QR cod plată pe factură
  showShipping: boolean('show_shipping').notNull().default(true), // date privind expediția
  showEmittedWith: boolean('show_emitted_with').notNull().default(false), // "Emis cu facturamea"
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoice_models_company').on(table.companyId),
]);

// Per-company VAT-rate catalogue ("Cote TVA"). Mirrors Oblio's Setări → TVA:
// each row is a named rate the user can pick in the emit form. `regime` maps
// to transportInvoices.vatRegime so the chosen cotă carries its fiscal regime.
export const invoiceTvaRates = pgTable('invoice_tva_rates', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),         // 'Normală', 'Redusă', 'Scutită', 'Taxare inversă'...
  percent: doublePrecision('percent').notNull().default(0), // 21, 11, 0...
  regime: varchar('regime', { length: 24 }).notNull().default('standard'),
  description: text('description'),                          // 'Taxare inversă conform Art. 331 alin 2(C)'
  isDefault: boolean('is_default').notNull().default(false),
  position: integer('position').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoice_tva_rates_company').on(table.companyId),
]);

// Transport invoices — issued by users to their own clients. Separate from
// the platform `invoices` table (which bills companies for TH subscriptions).
export const transportInvoices = pgTable('transport_invoices', {
  id: text('id').primaryKey(),
  // Issuer
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  issuedByUserId: text('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Document identity
  seriesId: text('series_id').notNull().references(() => invoiceSeries.id, { onDelete: 'restrict' }),
  sequenceNumber: integer('sequence_number').notNull(),
  fullNumber: varchar('full_number', { length: 64 }).notNull(),
  // 'factura' | 'proforma' | 'storno' | 'chitanta'
  kind: varchar('kind', { length: 16 }).notNull(),
  // Recipient — exactly one of clientCompanyId (internal) or clientExternalId (external)
  clientCompanyId: text('client_company_id').references(() => companies.id, { onDelete: 'set null' }),
  clientExternalId: text('client_external_id').references(() => invoiceClients.id, { onDelete: 'set null' }),
  // Snapshot of client data at issue time (so later edits to clients don't mutate history)
  clientNameSnap: varchar('client_name_snap', { length: 200 }).notNull(),
  clientTaxIdSnap: varchar('client_tax_id_snap', { length: 32 }),
  clientAddressSnap: text('client_address_snap'),
  // Optional links to platform entities
  orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
  parentInvoiceId: text('parent_invoice_id'), // for storno + chitanta linking back to the original
  modelId: text('model_id').references(() => invoiceModels.id, { onDelete: 'set null' }),
  // Money
  currency: varchar('currency', { length: 5 }).notNull().default('RON'),
  vatRegime: varchar('vat_regime', { length: 24 }).default('standard'), // 'standard' | 'reverse_charge' | 'exempt' | 'tva_la_incasare' | 'export_extra_eu' | 'intra_eu'
  subtotalCents: integer('subtotal_cents').notNull(),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  paidCents: integer('paid_cents').notNull().default(0),
  // Lifecycle
  // 'draft' | 'issued' | 'sent' | 'paid' | 'partial' | 'overdue' | 'disputed' | 'voided'
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  issuedAt: timestamp('issued_at'),
  sentAt: timestamp('sent_at'),
  dueAt: timestamp('due_at'),
  paidAt: timestamp('paid_at'),
  // PDF + e-Factura
  pdfUrl: text('pdf_url'),
  efacturaXml: text('efactura_xml'),
  efacturaStatus: varchar('efactura_status', { length: 20 }),
  efacturaSubmittedAt: timestamp('efactura_submitted_at'),
  efacturaAnafId: text('efactura_anaf_id'),
  efacturaError: text('efactura_error'),
  // BNR exchange rate snapshot — captured at issueDate when currency ≠ RON.
  bnrRate: doublePrecision('bnr_rate'),
  bnrRateDate: date('bnr_rate_date', { mode: 'string' }),
  // RON-converted amounts frozen at issue (currency===RON → equal to *_cents;
  // else round(cents * bnrRate)). Declarations (D300/D394/D390/SAF-T) and the
  // ledger MUST aggregate THESE, never the raw foreign-currency cents, or VAT is
  // misstated to ANAF (1.000 EUR would be declared as 1.000 RON).
  subtotalRonCents: integer('subtotal_ron_cents'),
  vatRonCents: integer('vat_ron_cents'),
  totalRonCents: integer('total_ron_cents'),
  // TVA la încasare snapshot (regime where VAT is owed only on payment, not issue).
  vatAtCollection: boolean('vat_at_collection').default(false),
  // Chitanță → factură linkback (when kind='chitanta').
  chitantaForInvoiceId: text('chitanta_for_invoice_id'),
  // Document presentation — language for PDF copy + decimal precision.
  language: varchar('language', { length: 5 }).notNull().default('ro'), // 'ro' | 'en'
  precision: integer('precision').notNull().default(2),                 // decimals shown
  // Public share link (read-only PDF view) — random token, null until shared.
  shareToken: varchar('share_token', { length: 40 }),
  // Single optional attachment (Oblio "Atașează document").
  attachmentUrl: text('attachment_url'),
  attachmentName: varchar('attachment_name', { length: 200 }),
  // Online payment link (Stripe) so the client can pay the invoice by card.
  paymentLinkUrl: text('payment_link_url'),
  paymentLinkId: varchar('payment_link_id', { length: 80 }),
  paymentLinkStatus: varchar('payment_link_status', { length: 16 }), // active | paid
  // Notes
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_transport_invoices_full').on(table.companyId, table.fullNumber),
  uniqueIndex('uq_transport_invoices_share').on(table.shareToken),
  uniqueIndex('uq_transport_invoices_series_seq').on(table.seriesId, table.sequenceNumber),
  index('idx_transport_invoices_company').on(table.companyId),
  index('idx_transport_invoices_status').on(table.status),
  index('idx_transport_invoices_kind').on(table.kind),
  index('idx_transport_invoices_due').on(table.dueAt),
  index('idx_transport_invoices_order').on(table.orderId),
]);

// Line items for transport invoices.
export const transportInvoiceLines = pgTable('transport_invoice_lines', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => transportInvoices.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  productId: text('product_id'), // catalogue link (drives stock-out when the item is stocked)
  code: varchar('code', { length: 64 }), // optional product/service code (Oblio "Cod")
  description: text('description').notNull(),
  quantity: doublePrecision('quantity').notNull().default(1),
  unit: varchar('unit', { length: 16 }).notNull().default('buc'),
  unitPriceCents: integer('unit_price_cents').notNull(),
  vatRate: doublePrecision('vat_rate').notNull().default(0), // 0/5/9/19 etc
  lineTotalCents: integer('line_total_cents').notNull(),
}, (table) => [
  index('idx_invoice_lines_invoice').on(table.invoiceId),
]);

// Optional: payments / receipts (chitanță) recorded against an invoice. We
// reuse `chitanta` as the invoice kind itself; this table just holds the
// money-flow events when partial payments are recorded.
export const transportInvoicePayments = pgTable('transport_invoice_payments', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id').notNull().references(() => transportInvoices.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 5 }).notNull().default('RON'),
  method: varchar('method', { length: 24 }), // 'transfer' | 'card' | 'cash' | 'compensation'
  reference: varchar('reference', { length: 80 }), // OP number, terminal id, etc
  receivedAt: timestamp('received_at').notNull().defaultNow(),
  recordedByUserId: text('recorded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_invoice_payments_invoice').on(table.invoiceId),
  // Idempotency: one payment per (invoice, external reference) — prevents a bank
  // reconciliation / import from applying the same transaction twice.
  uniqueIndex('uq_invoice_payment_ref').on(table.invoiceId, table.reference).where(sql`reference IS NOT NULL`),
]);

// ─── Expeditor module: transport dossiers ────────────────────
// A dossier groups everything about one transport job: client side (PO from
// the customer), carrier side (order to the assigned trucker), the freight
// listing, status events, CMR, invoices. Visible only to the dossier owner;
// the carrier sees a derived order entity from `orders`.
// Documents attached to a dossier (CMR, invoices in/out, client PO, carrier
// order). The `kind` lets the UI group them in tabs.
// Tracking events on a dossier (sosit la încărcare / încărcat / sosit la
// descărcare / descărcat / etc). Driven by carrier-side status updates; surfaced
// to the client as live tracking.
// ─── Invoicing v2: products catalog (nomenclator) ──────────────
//
// Reusable services/products per company. Picker on invoice issue
// pulls prices, UM, VAT, productType so issuers don't retype.
export const invoiceProducts = pgTable('invoice_products', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 64 }),
  name: varchar('name', { length: 300 }).notNull(),
  description: text('description'),
  defaultUnitPriceCents: integer('default_unit_price_cents'),
  defaultCurrency: varchar('default_currency', { length: 5 }).default('RON'),
  defaultUm: varchar('default_um', { length: 16 }).default('buc'),
  defaultVatRate: doublePrecision('default_vat_rate').default(21),
  // 'Marfuri' | 'Servicii' | 'Produs finit' | 'Materii prime' | 'Semifabricate' | 'Obiecte de inventar' | 'Ambalaje'
  productType: varchar('product_type', { length: 40 }).default('Servicii'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_invoice_products_company').on(table.companyId),
  index('idx_invoice_products_active').on(table.companyId, table.isActive),
]);

// ─── Invoicing v2: recurring invoices ──────────────────────────
//
// Auto-emit invoices on a schedule. The cron handler fans these out and
// updates `nextRunAt` after each generation. Lines are stored as a JSON
// snapshot so editing them doesn't affect already-emitted invoices.
export const invoiceRecurring = pgTable('invoice_recurring', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  clientCompanyId: text('client_company_id').references(() => companies.id, { onDelete: 'set null' }),
  clientExternalId: text('client_external_id').references(() => invoiceClients.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 200 }).notNull(),
  // 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  frequency: varchar('frequency', { length: 20 }).notNull(),
  startAt: date('start_at', { mode: 'string' }).notNull(),
  endAt: date('end_at', { mode: 'string' }),
  nextRunAt: date('next_run_at', { mode: 'string' }).notNull(),
  lastRunAt: date('last_run_at', { mode: 'string' }),
  seriesId: text('series_id').references(() => invoiceSeries.id),
  currency: varchar('currency', { length: 5 }).default('RON'),
  vatRegime: varchar('vat_regime', { length: 24 }).default('standard'),
  // JSON array: [{description, quantity, unit, unitPriceCents, vatRate}]
  linesJson: text('lines_json').notNull(),
  paymentTermDays: integer('payment_term_days').default(30),
  sendEmail: boolean('send_email').default(true),
  recipientEmail: varchar('recipient_email', { length: 255 }),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  totalRuns: integer('total_runs').default(0),
  maxRuns: integer('max_runs'),
  createdByUserId: text('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_recurring_company').on(table.companyId),
  index('idx_recurring_next').on(table.isActive, table.nextRunAt),
]);

// ─── Invoicing v2: BNR daily FX rates cache ────────────────────
//
// One row per (date, currency). Quoted as RON per 1 unit of `currency`.
// Cache is filled from BNR's daily XML feed; lookups fall back to the
// last available rate for dates not yet fetched.
export const bnrRatesDaily = pgTable('bnr_rates_daily', {
  rateDate: date('rate_date', { mode: 'string' }).notNull(),
  currency: varchar('currency', { length: 5 }).notNull(),
  rate: doublePrecision('rate').notNull(),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.rateDate, table.currency] }),
  index('idx_bnr_rates_date').on(table.rateDate),
]);

// ─── e-CMR (electronic Consignment Note) ────────────────────
// Standalone CMR documents (Convention Geneva 1956 + UNECE
// Additional Protocol). One row per issued consignment.

// ═══════════════════════════════════════════════════════════════════════
// facturamea — licensing, inventory (gestiune), expenses (cheltuieli), POS
// ═══════════════════════════════════════════════════════════════════════

// Lifetime/trial license per company. Gates access to the app behind paywall.
export const appLicenses = pgTable('app_licenses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  plan: varchar('plan', { length: 20 }).notNull().default('trial'), // 'trial' | 'lifetime'
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'expired' | 'canceled'
  trialEndsAt: timestamp('trial_ends_at'),
  activatedAt: timestamp('activated_at'),
  amountCents: integer('amount_cents'),
  currency: varchar('currency', { length: 5 }).default('RON'),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  grantedByAdminId: text('granted_by_admin_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_app_licenses_company').on(table.companyId),
]);

// Warehouses / gestiuni (depozit, magazin, custodie).
export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 32 }),
  type: varchar('type', { length: 20 }).notNull().default('depozit'), // depozit | magazin | custodie
  address: text('address'),
  managementType: varchar('management_type', { length: 20 }).default('cantitativ_valoric'), // cantitativ_valoric | global_valoric
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_warehouses_company').on(table.companyId),
]);

// Current stock level per (warehouse, product). Denormalized for fast reads.
export const stockLevels = pgTable('stock_levels', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoiceProducts.id, { onDelete: 'cascade' }),
  quantity: doublePrecision('quantity').notNull().default(0),
  avgCostCents: integer('avg_cost_cents').notNull().default(0),
  minQuantity: doublePrecision('min_quantity').default(0),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_stock_levels_wh_product').on(table.warehouseId, table.productId),
  index('idx_stock_levels_company').on(table.companyId),
]);

// Stock movement ledger — every in/out/transfer/adjustment.
export const stockMovements = pgTable('stock_movements', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoiceProducts.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull(), // in | out | transfer | adjust
  quantity: doublePrecision('quantity').notNull(),
  unitCostCents: integer('unit_cost_cents').default(0),
  reason: varchar('reason', { length: 200 }),
  refType: varchar('ref_type', { length: 20 }), // nir | invoice | pos | manual | transfer
  refId: text('ref_id'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_stock_moves_company').on(table.companyId),
  index('idx_stock_moves_product').on(table.productId),
  index('idx_stock_moves_ref').on(table.refType, table.refId),
]);

// Suppliers (furnizori) for expenses + NIR receptions.
export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  cui: varchar('cui', { length: 32 }),
  regCom: varchar('reg_com', { length: 32 }),
  address: text('address'),
  city: varchar('city', { length: 120 }),
  country: varchar('country', { length: 80 }).default('Romania'),
  iban: varchar('iban', { length: 40 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_suppliers_company').on(table.companyId),
]);

// Goods reception note (NIR — Notă de Intrare Recepție).
export const receptions = pgTable('receptions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'restrict' }),
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  nirNumber: varchar('nir_number', { length: 64 }).notNull(),
  supplierInvoiceNumber: varchar('supplier_invoice_number', { length: 64 }),
  receptionDate: date('reception_date', { mode: 'string' }),
  netCents: integer('net_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft | posted
  notes: text('notes'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_receptions_company').on(table.companyId),
]);

export const receptionLines = pgTable('reception_lines', {
  id: text('id').primaryKey(),
  receptionId: text('reception_id').notNull().references(() => receptions.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => invoiceProducts.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 300 }).notNull(),
  um: varchar('um', { length: 16 }).default('buc'),
  quantity: doublePrecision('quantity').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull().default(0),
  vatRate: doublePrecision('vat_rate').default(21),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
}, (table) => [
  index('idx_reception_lines_reception').on(table.receptionId),
]);

// Expenses (cheltuieli) — incoming supplier invoices / receipts.
export const expenses = pgTable('expenses', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierNameSnap: varchar('supplier_name_snap', { length: 200 }),
  category: varchar('category', { length: 60 }), // utilitati, chirie, combustibil, servicii, marfa, salarii, taxe, altele
  documentType: varchar('document_type', { length: 20 }).default('factura'), // factura | bon | chitanta | extras
  documentNumber: varchar('document_number', { length: 64 }),
  issueDate: date('issue_date', { mode: 'string' }),
  dueDate: date('due_date', { mode: 'string' }),
  currency: varchar('currency', { length: 5 }).default('RON'),
  bnrRate: doublePrecision('bnr_rate'), // BNR rate to RON for non-RON expenses (declarations report in RON)
  netCents: integer('net_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  paidCents: integer('paid_cents').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('unpaid'), // unpaid | partial | paid
  deductible: boolean('deductible').default(true),
  attachmentUrl: text('attachment_url'),
  attachmentName: varchar('attachment_name', { length: 200 }),
  notes: text('notes'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_expenses_company').on(table.companyId),
  index('idx_expenses_status').on(table.companyId, table.status),
]);

// POS sales (casă de marcat / bon fiscal).
export const posSales = pgTable('pos_sales', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').references(() => warehouses.id, { onDelete: 'set null' }),
  receiptNumber: varchar('receipt_number', { length: 64 }).notNull(),
  cashierUserId: text('cashier_user_id').references(() => users.id, { onDelete: 'set null' }),
  paymentMethod: varchar('payment_method', { length: 16 }).notNull().default('cash'), // cash | card | mixed
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  vatCents: integer('vat_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  cashReceivedCents: integer('cash_received_cents').default(0),
  changeCents: integer('change_cents').default(0),
  invoiceId: text('invoice_id').references(() => transportInvoices.id, { onDelete: 'set null' }),
  // Fiscalizare prin driver local de casă de marcat (ErpNet.FP / AMEF).
  // fiscalStatus: none (neîncercat) | printed (bon fiscal emis) | error.
  // Când e 'printed', fiscalReceiptNumber + fiscalSerial vin din memoria fiscală a aparatului.
  fiscalStatus: varchar('fiscal_status', { length: 16 }).notNull().default('none'),
  fiscalReceiptNumber: varchar('fiscal_receipt_number', { length: 64 }),
  fiscalSerial: varchar('fiscal_serial', { length: 64 }),
  fiscalError: text('fiscal_error'),
  fiscalPrintedAt: timestamp('fiscal_printed_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_pos_sales_company').on(table.companyId),
  index('idx_pos_sales_created').on(table.companyId, table.createdAt),
  // One receipt number per company (no duplicate BON under concurrent sales).
  uniqueIndex('uq_pos_sales_receipt').on(table.companyId, table.receiptNumber),
]);

export const posSaleLines = pgTable('pos_sale_lines', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().references(() => posSales.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => invoiceProducts.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 300 }).notNull(),
  quantity: doublePrecision('quantity').notNull().default(1),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  vatRate: doublePrecision('vat_rate').default(21),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
}, (table) => [
  index('idx_pos_sale_lines_sale').on(table.saleId),
]);

// ═══════════════════════════════════════════════════════════════════════
// facturamea — platform settings (key-value) + revenue share (Stripe Connect)
// ═══════════════════════════════════════════════════════════════════════

// Generic platform-level key-value config (single-tenant platform settings).
// Used by revenue share: revshare_account_id / revshare_enabled / revshare_bps / revshare_base.
export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Audit of each automatic revenue-share transfer to the associate's Connect account.
export const revenueSharePayouts = pgTable('revenue_share_payouts', {
  id: text('id').primaryKey(),
  sourceType: varchar('source_type', { length: 24 }).notNull().default('lifetime'), // ce a generat plata
  sourceId: varchar('source_id', { length: 128 }).notNull(),   // Stripe Checkout session id (idempotency)
  companyId: text('company_id'),                               // firma cumpărătoare
  destinationAccount: varchar('destination_account', { length: 64 }).notNull(), // acct_...
  grossCents: integer('gross_cents').notNull().default(0),     // suma plătită de client
  feeCents: integer('fee_cents').notNull().default(0),         // comision Stripe
  baseCents: integer('base_cents').notNull().default(0),       // baza pe care s-a aplicat %
  bps: integer('bps').notNull().default(0),                    // procent în basis points (2000=20%)
  amountCents: integer('amount_cents').notNull().default(0),   // suma efectiv transferată
  currency: varchar('currency', { length: 8 }).notNull().default('RON'),
  stripeTransferId: varchar('stripe_transfer_id', { length: 64 }),
  status: varchar('status', { length: 16 }).notNull().default('pending'), // pending|paid|skipped|error
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_revshare_source').on(table.sourceType, table.sourceId),
  index('idx_revshare_created').on(table.createdAt),
]);

// ═══════════════════════════════════════════════════════════════════════
// facturamea — public API keys, admin email campaigns, import jobs
// ═══════════════════════════════════════════════════════════════════════

// Developer API keys (Bearer auth for /api/v1/*). Full key shown once at
// creation; only the sha256 hash is stored.
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  prefix: varchar('prefix', { length: 20 }).notNull(), // e.g. fm_live_AB12 (shown in UI)
  keyHash: text('key_hash').notNull(),                  // sha256(full key)
  scopes: text('scopes'),                               // JSON array; null = all scopes
  mode: varchar('mode', { length: 8 }).notNull().default('live'), // live | test
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_api_keys_company').on(table.companyId),
  uniqueIndex('uq_api_keys_hash').on(table.keyHash),
]);

// Admin-composed HTML email campaigns (Resend send).
export const emailCampaigns = pgTable('email_campaigns', {
  id: text('id').primaryKey(),
  subject: varchar('subject', { length: 300 }).notNull(),
  html: text('html').notNull(),
  preheader: varchar('preheader', { length: 300 }),
  audience: varchar('audience', { length: 40 }).notNull().default('all'), // all | trial | lifetime | custom
  customRecipients: text('custom_recipients'), // newline/comma-separated emails when audience='custom'
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft | sending | sent | failed
  totalRecipients: integer('total_recipients').default(0),
  sentCount: integer('sent_count').default(0),
  failedCount: integer('failed_count').default(0),
  createdByAdminId: text('created_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
  sentAt: timestamp('sent_at'),
}, (table) => [
  index('idx_email_campaigns_status').on(table.status),
]);

// Import jobs — history/audit of data imported from other platforms.
export const importJobs = pgTable('import_jobs', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  source: varchar('source', { length: 40 }),  // oblio | smartbill | fgo | csv | json
  entity: varchar('entity', { length: 30 }),  // clients | products | invoices
  status: varchar('status', { length: 16 }).notNull().default('pending'), // pending | done | failed
  totalRows: integer('total_rows').default(0),
  importedRows: integer('imported_rows').default(0),
  errorRows: integer('error_rows').default(0),
  errorLog: text('error_log'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_import_jobs_company').on(table.companyId),
]);

// ═══════════════════════════════════════════════════════════════════════
// facturamea — round 2: inbound e-Factura, e-Transport, bank reconciliation,
// online payment links, e-commerce connectors, courier shipments.
// ═══════════════════════════════════════════════════════════════════════

// Received e-Factura messages pulled from ANAF SPV (facturi primite).
export const efacturaInbox = pgTable('efactura_inbox', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  anafMsgId: varchar('anaf_msg_id', { length: 64 }).notNull(),
  msgType: varchar('msg_type', { length: 32 }),       // FACTURA PRIMITA | ERORI | etc.
  fromCif: varchar('from_cif', { length: 20 }),
  supplierName: varchar('supplier_name', { length: 200 }),
  detail: text('detail'),
  xml: text('xml'),
  totalCents: integer('total_cents'),
  currency: varchar('currency', { length: 5 }).default('RON'),
  issueDate: date('issue_date', { mode: 'string' }),
  status: varchar('status', { length: 20 }).notNull().default('nou'), // nou | importat | ignorat
  importedExpenseId: text('imported_expense_id'),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_efactura_inbox_msg').on(table.companyId, table.anafMsgId),
  index('idx_efactura_inbox_company').on(table.companyId),
]);

// e-Transport declarations (UIT) created from the app.
export const etransportDeclarations = pgTable('etransport_declarations', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  uit: varchar('uit', { length: 64 }),
  spvIndex: varchar('spv_index', { length: 64 }),
  operationType: varchar('operation_type', { length: 40 }),   // AIC | transport intern | etc.
  senderName: varchar('sender_name', { length: 200 }),
  recipientName: varchar('recipient_name', { length: 200 }),
  loadingAddress: text('loading_address'),
  unloadingAddress: text('unloading_address'),
  vehiclePlate: varchar('vehicle_plate', { length: 20 }),
  goodsJson: text('goods_json'),                              // line items snapshot
  totalValueCents: integer('total_value_cents'),
  status: varchar('status', { length: 20 }).notNull().default('draft'), // draft | sent | confirmed | error
  errorText: text('error_text'),
  xml: text('xml'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_etransport_company').on(table.companyId),
]);

// Bank accounts + imported statement transactions (reconciliere bancară).
export const bankAccounts = pgTable('bank_accounts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 120 }).notNull(),
  iban: varchar('iban', { length: 40 }),
  bank: varchar('bank', { length: 80 }),
  currency: varchar('currency', { length: 5 }).notNull().default('RON'),
  balanceCents: integer('balance_cents').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_bank_accounts_company').on(table.companyId),
]);

export const bankTransactions = pgTable('bank_transactions', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  bookingDate: date('booking_date', { mode: 'string' }),
  amountCents: integer('amount_cents').notNull(),   // + incoming, - outgoing
  currency: varchar('currency', { length: 5 }).notNull().default('RON'),
  description: text('description'),
  counterparty: varchar('counterparty', { length: 200 }),
  counterpartyIban: varchar('counterparty_iban', { length: 40 }),
  reference: varchar('reference', { length: 120 }),
  reconciled: boolean('reconciled').notNull().default(false),
  matchedType: varchar('matched_type', { length: 16 }),  // invoice | expense
  matchedId: text('matched_id'),
  externalId: varchar('external_id', { length: 120 }),   // dedupe key from statement
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_bank_tx_company').on(table.companyId),
  index('idx_bank_tx_account').on(table.accountId),
  index('idx_bank_tx_reconciled').on(table.companyId, table.reconciled),
]);

// E-commerce / external integrations (WooCommerce, Shopify, PrestaShop, custom).
export const integrationConnections = pgTable('integration_connections', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 40 }).notNull(), // woocommerce | shopify | prestashop | custom
  label: varchar('label', { length: 120 }),
  baseUrl: text('base_url'),
  configEnc: text('config_enc'),                 // encrypted API creds (when needed)
  webhookSecret: varchar('webhook_secret', { length: 64 }),
  autoInvoice: boolean('auto_invoice').default(true),
  isActive: boolean('is_active').default(true),
  lastEventAt: timestamp('last_event_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_integration_conn_company').on(table.companyId),
  uniqueIndex('uq_integration_webhook').on(table.webhookSecret),
]);

// Courier shipments / AWB (Sameday, FAN, DPD, ...).
export const shipments = pgTable('shipments', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 24 }).notNull(), // sameday | fan | dpd | cargus
  awb: varchar('awb', { length: 64 }),
  invoiceId: text('invoice_id').references(() => transportInvoices.id, { onDelete: 'set null' }),
  recipientName: varchar('recipient_name', { length: 200 }),
  recipientPhone: varchar('recipient_phone', { length: 40 }),
  address: text('address'),
  city: varchar('city', { length: 120 }),
  county: varchar('county', { length: 80 }),
  parcels: integer('parcels').default(1),
  weightKg: doublePrecision('weight_kg'),
  codCents: integer('cod_cents').default(0),          // ramburs
  status: varchar('status', { length: 24 }).default('draft'),
  labelUrl: text('label_url'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_shipments_company').on(table.companyId),
]);

// ═══════════════════════════════════════════════════════════════════════
// facturamea — round 4: double-entry accounting, fixed assets, orders,
// advanced inventory (counts/lots), payment reminders (dunning).
// ═══════════════════════════════════════════════════════════════════════

// Chart of accounts (plan de conturi RO). type: A(active)|P(pasive)|B(bifunctional)|V(venituri)|C(cheltuieli).
export const ledgerAccounts = pgTable('ledger_accounts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 12 }).notNull(),  // 4111, 707, 4427, ...
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 2 }).notNull().default('B'),
  parentCode: varchar('parent_code', { length: 12 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_ledger_accounts_code').on(table.companyId, table.code),
  index('idx_ledger_accounts_company').on(table.companyId),
]);

// Journal entries (note contabile) + balanced lines (debit/credit).
export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  entryNumber: varchar('entry_number', { length: 32 }),
  entryDate: date('entry_date', { mode: 'string' }),
  description: text('description'),
  source: varchar('source', { length: 24 }).default('manual'), // manual | invoice | expense | payment | bank | depreciation
  refType: varchar('ref_type', { length: 24 }),
  refId: text('ref_id'),
  totalDebitCents: integer('total_debit_cents').notNull().default(0),
  totalCreditCents: integer('total_credit_cents').notNull().default(0),
  posted: boolean('posted').notNull().default(true),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_journal_entries_company').on(table.companyId),
  index('idx_journal_entries_date').on(table.companyId, table.entryDate),
  index('idx_journal_entries_ref').on(table.refType, table.refId),
  // One journal entry number per company (fiscal numbering integrity).
  uniqueIndex('uq_journal_entries_company_number').on(table.companyId, table.entryNumber),
  // Idempotency: at most one auto-posted entry per source document — turns the
  // SELECT-then-INSERT guard into a hard constraint (no duplicate revenue/VAT).
  uniqueIndex('uq_journal_entries_ref').on(table.companyId, table.refType, table.refId).where(sql`ref_type IS NOT NULL`),
]);

export const journalLines = pgTable('journal_lines', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  accountCode: varchar('account_code', { length: 12 }).notNull(),
  debitCents: integer('debit_cents').notNull().default(0),
  creditCents: integer('credit_cents').notNull().default(0),
  note: varchar('note', { length: 200 }),
}, (table) => [
  index('idx_journal_lines_entry').on(table.entryId),
  index('idx_journal_lines_account').on(table.companyId, table.accountCode),
]);

// Fixed assets (mijloace fixe) + depreciation schedule.
export const fixedAssets = pgTable('fixed_assets', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  inventoryNumber: varchar('inventory_number', { length: 40 }),
  category: varchar('category', { length: 80 }),
  acquisitionDate: date('acquisition_date', { mode: 'string' }),
  valueCents: integer('value_cents').notNull().default(0),
  usefulLifeMonths: integer('useful_life_months').notNull().default(12),
  method: varchar('method', { length: 16 }).default('liniara'), // liniara | degresiva | accelerata
  accumulatedCents: integer('accumulated_cents').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('active'), // active | disposed
  disposedAt: date('disposed_at', { mode: 'string' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_fixed_assets_company').on(table.companyId),
]);

export const depreciationEntries = pgTable('depreciation_entries', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => fixedAssets.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  period: varchar('period', { length: 7 }).notNull(), // YYYY-MM
  amountCents: integer('amount_cents').notNull().default(0),
  postedJournalId: text('posted_journal_id'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('uq_depreciation_period').on(table.assetId, table.period),
  index('idx_depreciation_company').on(table.companyId),
]);

// Purchase & sales orders (comenzi furnizori / clienți).
export const purchaseOrders = pgTable('purchase_orders', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  number: varchar('number', { length: 40 }).notNull(),
  supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  supplierNameSnap: varchar('supplier_name_snap', { length: 200 }),
  orderDate: date('order_date', { mode: 'string' }),
  expectedDate: date('expected_date', { mode: 'string' }),
  currency: varchar('currency', { length: 5 }).default('RON'),
  totalCents: integer('total_cents').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft | sent | received | closed | canceled
  notes: text('notes'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_purchase_orders_company').on(table.companyId),
]);

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => invoiceProducts.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 300 }).notNull(),
  quantity: doublePrecision('quantity').notNull().default(1),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  vatRate: doublePrecision('vat_rate').default(21),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
}, (table) => [
  index('idx_po_lines_order').on(table.orderId),
]);

export const salesOrders = pgTable('sales_orders', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  number: varchar('number', { length: 40 }).notNull(),
  clientExternalId: text('client_external_id').references(() => invoiceClients.id, { onDelete: 'set null' }),
  clientNameSnap: varchar('client_name_snap', { length: 200 }),
  orderDate: date('order_date', { mode: 'string' }),
  currency: varchar('currency', { length: 5 }).default('RON'),
  totalCents: integer('total_cents').notNull().default(0),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft | confirmed | invoiced | delivered | canceled
  invoiceId: text('invoice_id').references(() => transportInvoices.id, { onDelete: 'set null' }),
  notes: text('notes'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_sales_orders_company').on(table.companyId),
]);

export const salesOrderLines = pgTable('sales_order_lines', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => salesOrders.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => invoiceProducts.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 300 }).notNull(),
  quantity: doublePrecision('quantity').notNull().default(1),
  unitPriceCents: integer('unit_price_cents').notNull().default(0),
  vatRate: doublePrecision('vat_rate').default(21),
  lineTotalCents: integer('line_total_cents').notNull().default(0),
}, (table) => [
  index('idx_so_lines_order').on(table.orderId),
]);

// Advanced inventory: physical counts (inventariere) + lots/expiry.
export const stockCounts = pgTable('stock_counts', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  number: varchar('number', { length: 40 }),
  countDate: date('count_date', { mode: 'string' }),
  status: varchar('status', { length: 16 }).notNull().default('draft'), // draft | finalized
  notes: text('notes'),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_stock_counts_company').on(table.companyId),
]);

export const stockCountLines = pgTable('stock_count_lines', {
  id: text('id').primaryKey(),
  countId: text('count_id').notNull().references(() => stockCounts.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoiceProducts.id, { onDelete: 'cascade' }),
  systemQty: doublePrecision('system_qty').notNull().default(0),
  countedQty: doublePrecision('counted_qty').notNull().default(0),
  diffQty: doublePrecision('diff_qty').notNull().default(0),
}, (table) => [
  index('idx_stock_count_lines_count').on(table.countId),
]);

export const stockLots = pgTable('stock_lots', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').references(() => warehouses.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => invoiceProducts.id, { onDelete: 'cascade' }),
  lotCode: varchar('lot_code', { length: 64 }).notNull(),
  expiryDate: date('expiry_date', { mode: 'string' }),
  quantity: doublePrecision('quantity').notNull().default(0),
  unitCostCents: integer('unit_cost_cents').default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_stock_lots_company').on(table.companyId),
  index('idx_stock_lots_product').on(table.productId),
]);

// Automated payment reminders (dunning) log.
export const invoiceReminders = pgTable('invoice_reminders', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  invoiceId: text('invoice_id').notNull().references(() => transportInvoices.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 16 }).notNull(), // before | due | after
  sentTo: varchar('sent_to', { length: 200 }),
  sentAt: timestamp('sent_at').defaultNow(),
}, (table) => [
  index('idx_invoice_reminders_company').on(table.companyId),
  uniqueIndex('uq_invoice_reminder').on(table.invoiceId, table.kind),
]);

// ─── Blog / SEO content (auto-published) ───────────────────
export const blogPosts = pgTable('blog_posts', {
  id: text('id').primaryKey(),
  slug: varchar('slug', { length: 200 }).unique().notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  description: varchar('description', { length: 400 }).notNull(),
  keywords: text('keywords'),
  category: varchar('category', { length: 60 }),
  bodyHtml: text('body_html').notNull(),
  readMinutes: integer('read_minutes').default(5),
  status: varchar('status', { length: 16 }).notNull().default('published'),
  publishedAt: timestamp('published_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_blog_status_pub').on(table.status, table.publishedAt),
]);
