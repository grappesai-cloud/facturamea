import { pgTable, text, integer, boolean, timestamp, serial, varchar, doublePrecision, primaryKey, index, uniqueIndex, jsonb, date } from 'drizzle-orm/pg-core';

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
  companyId: text('company_id'),
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
  // e-Factura: when true, every issued invoice is auto-submitted to ANAF SPV on creation.
  efacturaAutoSend: boolean('efactura_auto_send').default(false),
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

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  nameAscii: varchar('name_ascii', { length: 500 }).notNull(),
  alternateNames: text('alternate_names'), // comma-separated alternate names
  postalCode: varchar('postal_code', { length: 20 }),
  countryCode: varchar('country_code', { length: 5 }).notNull(),
  countryName: varchar('country_name', { length: 100 }).notNull(),
  // admin1 from GeoNames postal data = județ for RO (region/state elsewhere).
  county: varchar('county', { length: 120 }),
  // false = not a real populated place (e.g. German "Großempfänger" businesses
  // & institutions that carry their own postal code). Excluded from search.
  isPlace: boolean('is_place').notNull().default(true),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
}, (table) => [
  index('idx_cities_name_ascii').on(table.nameAscii),
  index('idx_cities_postal').on(table.postalCode),
  index('idx_cities_country').on(table.countryCode),
  index('idx_cities_is_place').on(table.isPlace),
  // Idempotent seeding: same place+postal in same country shouldn't duplicate.
  uniqueIndex('uniq_cities_country_name_postal').on(table.countryCode, table.nameAscii, table.postalCode),
]);

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

export const freightTruckTypes = pgTable('freight_truck_types', {
  freightId: text('freight_id').notNull().references(() => freight.id, { onDelete: 'cascade' }),
  truckTypeId: varchar('truck_type_id', { length: 50 }).notNull().references(() => truckTypes.id),
}, (table) => [
  primaryKey({ columns: [table.freightId, table.truckTypeId] }),
]);

export const freightEquipment = pgTable('freight_equipment', {
  freightId: text('freight_id').notNull().references(() => freight.id, { onDelete: 'cascade' }),
  equipment: varchar('equipment', { length: 100 }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.freightId, table.equipment] }),
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

export const companyBadges = pgTable('company_badges', {
  id: text('id').primaryKey(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  // 'verified' | 'top_rated' | 'reliable_payer' | 'fast_responder' | 'active_5plus_yrs' | 'high_volume'
  code: varchar('code', { length: 50 }).notNull(),
  label: varchar('label', { length: 200 }).notNull(),
  // Metadata (JSON) — e.g. computed thresholds at the time of award
  metadata: text('metadata'),
  awardedAt: timestamp('awarded_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
}, (table) => [
  uniqueIndex('uq_company_badge').on(table.companyId, table.code),
  index('idx_badge_company').on(table.companyId),
]);

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
export const truckDocuments = pgTable('truck_documents', {
  id: text('id').primaryKey(),
  truckId: text('truck_id').notNull().references(() => trucks.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id),
  kind: varchar('kind', { length: 40 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  issuedAt: date('issued_at'),
  expiresAt: date('expires_at'),
  notes: text('notes'),
  uploadedByUserId: text('uploaded_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_truck_docs_truck').on(table.truckId),
]);

// ─── Truck live positions (latest GPS reading per fleet vehicle) ──────────
// One row per truck, upserted by the fleet GPS sync (matched device↔truck by
// plate). Powers the Parc auto map + live status, independent of orders.
export const truckPositions = pgTable('truck_positions', {
  truckId: text('truck_id').primaryKey().references(() => trucks.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  speedKmh: doublePrecision('speed_kmh'),
  headingDeg: doublePrecision('heading_deg'),
  deviceId: varchar('device_id', { length: 120 }),
  recordedAt: timestamp('recorded_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_truck_positions_company').on(table.companyId),
]);

// ─── Available Trucks (Camioane disponibile) ──────────────

export const availableTrucks = pgTable('available_trucks', {
  id: text('id').primaryKey(),
  // Public sequential ID shown in UI/URLs (10000+).
  displayId: integer('display_id').unique(),
  postedBy: text('posted_by').notNull().references(() => users.id),
  companyId: text('company_id').notNull().references(() => companies.id),
  status: varchar('status', { length: 20 }).default('active'),

  // Departure point
  departureCityId: integer('departure_city_id'),
  departureCityName: varchar('departure_city_name', { length: 500 }).notNull(),
  departureCountry: varchar('departure_country', { length: 10 }).notNull(),
  departureLat: doublePrecision('departure_lat'),
  departureLng: doublePrecision('departure_lng'),

  // Destination (can be "anywhere" or specific)
  destinationCityName: varchar('destination_city_name', { length: 500 }),
  destinationCountry: varchar('destination_country', { length: 10 }),
  destinationLat: doublePrecision('destination_lat'),
  destinationLng: doublePrecision('destination_lng'),
  destinationFlexible: boolean('destination_flexible').default(false),

  // Availability dates
  availableFrom: date('available_from', { mode: 'string' }).notNull(),
  availableTo: varchar('available_to', { length: 20 }),

  // Truck details
  truckTypeId: varchar('truck_type_id', { length: 50 }).references(() => truckTypes.id),
  licensePlate: varchar('license_plate', { length: 50 }),
  maxWeight: doublePrecision('max_weight'),
  maxVolume: doublePrecision('max_volume'),
  isFullTruck: boolean('is_full_truck').default(true),

  // Equipment
  hasAdr: boolean('has_adr').default(false),
  hasFrigo: boolean('has_frigo').default(false),
  hasLift: boolean('has_lift').default(false),
  hasWalkingFloor: boolean('has_walking_floor').default(false),
  hasMegaTrailer: boolean('has_mega_trailer').default(false),
  hasGondola: boolean('has_gondola').default(false),

  // Pricing
  pricePerKm: doublePrecision('price_per_km'),
  priceTotal: doublePrecision('price_total'),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  includesTva: boolean('includes_tva').default(false),

  // Meta
  description: text('description'),
  // Floor length (m) - usable trailer length
  floorLength: doublePrecision('floor_length'),
  // Number of vehicles (for car carriers)
  vehicleCount: integer('vehicle_count'),
  // Permitted countries (carrier accepts loads to these countries; ISO codes)
  permittedCountries: text('permitted_countries'), // comma-separated for simplicity
  // Optional extra stops between departure and final destination, in order.
  // Each stop: { cityName, country, postal?, lat?, lng?, lookingFor? }
  // Used for multi-leg trips ("Cluj → Sibiu → Brașov → București").
  extraStops: jsonb('extra_stops'),
  // 'spot' | 'long_term'
  contractType: varchar('contract_type', { length: 20 }).default('spot'),
  // Premium "evidențiat"
  isFeatured: boolean('is_featured').default(false),
  expiresAt: timestamp('expires_at'),
  viewCount: integer('view_count').default(0),
  deletedAt: timestamp('deleted_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_avail_trucks_status').on(table.status),
  index('idx_avail_trucks_departure').on(table.departureCountry, table.departureCityName),
  index('idx_avail_trucks_date').on(table.availableFrom),
  index('idx_avail_trucks_company').on(table.companyId),
  index('idx_avail_trucks_featured').on(table.isFeatured),
  index('idx_avail_trucks_posted_by').on(table.postedBy),
  index('idx_avail_trucks_deleted_at').on(table.deletedAt),
]);

// ─── Saved Routes ─────────────────────────────────────────

export const savedRoutes = pgTable('saved_routes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: varchar('name', { length: 200 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(),
  loadingCountry: varchar('loading_country', { length: 10 }),
  loadingCity: varchar('loading_city', { length: 500 }),
  unloadingCountry: varchar('unloading_country', { length: 10 }),
  unloadingCity: varchar('unloading_city', { length: 500 }),
  truckTypeId: varchar('truck_type_id', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
});

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

export const classifiedImages = pgTable('classified_images', {
  id: text('id').primaryKey(),
  classifiedId: text('classified_id').notNull().references(() => classifieds.id, { onDelete: 'cascade' }),
  imageUrl: text('image_url').notNull(),
  sortOrder: integer('sort_order').default(0),
});

// ─── Forum ─────────────────────────────────────────────────

export const forumThreads = pgTable('forum_threads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: varchar('title', { length: 500 }).notNull(),
  body: text('body').notNull(),
  isPinned: boolean('is_pinned').default(false),
  isLocked: boolean('is_locked').default(false),
  replyCount: integer('reply_count').default(0),
  lastReplyAt: timestamp('last_reply_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_threads_created').on(table.createdAt),
]);

export const forumReplies = pgTable('forum_replies', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull().references(() => forumThreads.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_replies_thread').on(table.threadId),
]);

// ─── Auctions (Licitații) ─────────────────────────────────

export const auctions = pgTable('auctions', {
  id: text('id').primaryKey(),
  // Public sequential ID shown in UI/URLs (10000+).
  displayId: integer('display_id').unique(),
  postedBy: text('posted_by').notNull().references(() => users.id),
  companyId: text('company_id').notNull().references(() => companies.id),
  title: varchar('title', { length: 500 }),

  // Status: active -> awarded | cancelled | expired
  status: varchar('status', { length: 20 }).default('active'),

  // Cargo / route
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
  quantity: integer('quantity').default(1),
  distanceKm: integer('distance_km'),
  isFullTruck: boolean('is_full_truck').default(true),
  description: text('description'),

  // Auction params
  startingPrice: doublePrecision('starting_price'),   // max acceptable bid (bids must be <=)
  reservePrice: doublePrecision('reserve_price'),     // owner won't award below this
  currency: varchar('currency', { length: 5 }).default('EUR'),
  includesTva: boolean('includes_tva').default(false),
  awardMode: varchar('award_mode', { length: 20 }).default('manual'), // 'manual' | 'lowest'
  endsAt: timestamp('ends_at').notNull(),

  // Resolution
  winnerBidId: text('winner_bid_id'),
  orderId: text('order_id'),
  awardedAt: timestamp('awarded_at'),
  cancelledAt: timestamp('cancelled_at'),

  // Denormalized
  bidCount: integer('bid_count').default(0),
  viewCount: integer('view_count').default(0),

  // Premium "evidențiat"
  isFeatured: boolean('is_featured').default(false),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_auctions_status').on(table.status),
  index('idx_auctions_loading').on(table.loadingCountry, table.loadingCityName),
  index('idx_auctions_unloading').on(table.unloadingCountry, table.unloadingCityName),
  index('idx_auctions_ends').on(table.endsAt),
  index('idx_auctions_company').on(table.companyId),
  index('idx_auctions_featured').on(table.isFeatured),
  index('idx_auctions_posted_by').on(table.postedBy),
]);

export const auctionBids = pgTable('auction_bids', {
  id: text('id').primaryKey(),
  auctionId: text('auction_id').notNull().references(() => auctions.id, { onDelete: 'cascade' }),
  bidderUserId: text('bidder_user_id').notNull().references(() => users.id),
  bidderCompanyId: text('bidder_company_id').notNull().references(() => companies.id),
  priceTotal: doublePrecision('price_total').notNull(),
  pricePerKm: doublePrecision('price_per_km'),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  includesTva: boolean('includes_tva').default(false),
  truckTypeId: varchar('truck_type_id', { length: 50 }).references(() => truckTypes.id),
  message: text('message'),
  validUntil: timestamp('valid_until'),
  // Status: active -> winner | rejected | withdrawn
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_bids_auction').on(table.auctionId),
  index('idx_bids_bidder').on(table.bidderCompanyId),
  uniqueIndex('uq_bids_auction_company').on(table.auctionId, table.bidderCompanyId),
]);

export const auctionTruckTypes = pgTable('auction_truck_types', {
  auctionId: text('auction_id').notNull().references(() => auctions.id, { onDelete: 'cascade' }),
  truckTypeId: varchar('truck_type_id', { length: 50 }).notNull().references(() => truckTypes.id),
}, (table) => [
  primaryKey({ columns: [table.auctionId, table.truckTypeId] }),
]);

// ─── Conversations & Messages ─────────────────────────────

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  // Context: de unde a pornit conversația
  contextType: varchar('context_type', { length: 30 }), // 'freight' | 'auction' | 'classified' | 'available_truck' | 'order' | 'direct'
  contextId: text('context_id'),
  // Strong FK when the conversation is tied to an order (carrier ↔ client
  // chat). Set automatically by the API when context_type='order'; FK in
  // DB (migration 0022) so order deletion clears the link instead of
  // dropping the thread.
  orderId: text('order_id'),
  subject: varchar('subject', { length: 500 }),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  lastMessagePreview: varchar('last_message_preview', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_conv_last_msg').on(table.lastMessageAt),
  index('idx_conv_context').on(table.contextType, table.contextId),
  index('idx_conv_order').on(table.orderId),
]);

export const conversationParticipants = pgTable('conversation_participants', {
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  companyId: text('company_id').references(() => companies.id),
  lastReadAt: timestamp('last_read_at'),
  isArchived: boolean('is_archived').default(false),
  isMuted: boolean('is_muted').default(false),
  joinedAt: timestamp('joined_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.conversationId, table.userId] }),
  index('idx_part_user').on(table.userId),
]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderUserId: text('sender_user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  attachmentUrl: text('attachment_url'),
  attachmentType: varchar('attachment_type', { length: 50 }),
  isSystem: boolean('is_system').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_msg_conv_created').on(table.conversationId, table.createdAt),
]);

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
export const routeAlerts = pgTable('route_alerts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }),
  type: varchar('type', { length: 20 }).notNull(), // 'freight' | 'truck' | 'auction'
  loadingCountry: varchar('loading_country', { length: 10 }),
  loadingCity: varchar('loading_city', { length: 500 }),
  unloadingCountry: varchar('unloading_country', { length: 10 }),
  unloadingCity: varchar('unloading_city', { length: 500 }),
  truckTypeId: varchar('truck_type_id', { length: 50 }),
  isActive: boolean('is_active').default(true),
  lastTriggeredAt: timestamp('last_triggered_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_alerts_user').on(table.userId),
  index('idx_alerts_type_active').on(table.type, table.isActive),
]);

// ─── Order Positions (Live Tracking) ──────────────────────

export const orderPositions = pgTable('order_positions', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  reportedBy: text('reported_by').references(() => users.id),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  speedKmh: doublePrecision('speed_kmh'),
  headingDeg: doublePrecision('heading_deg'),
  accuracyM: doublePrecision('accuracy_m'),
  source: varchar('source', { length: 30 }).default('manual'), // 'manual' | 'driver_app' | 'gps_device'
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_pos_order_recorded').on(table.orderId, table.recordedAt),
]);

// ─── Order stops: per-point loading/unloading tracking ──────────────────
// One row per loading or unloading point of an order (primary + extra stops),
// so the carrier can mark "ajuns" / "încărcat/descărcat" at each and the
// expeditor sees granular progress (loading 1/2/3, unloading 1/2/3).
export const orderStops = pgTable('order_stops', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull().default(0), // global order across all stops
  kind: varchar('kind', { length: 12 }).notNull(),    // 'loading' | 'unloading'
  position: integer('position').notNull().default(1), // 1-based index within its kind (încărcarea 1/2/3)
  cityName: varchar('city_name', { length: 200 }),
  country: varchar('country', { length: 10 }),
  postal: varchar('postal', { length: 20 }),
  address: text('address'),                            // optional detail (firmă pune adresa exactă)
  companyName: varchar('company_name', { length: 200 }), // firma de la punct
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  scheduledDate: varchar('scheduled_date', { length: 20 }),
  status: varchar('status', { length: 12 }).notNull().default('pending'), // 'pending' | 'arrived' | 'done'
  arrivedAt: timestamp('arrived_at'),
  doneAt: timestamp('done_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_order_stops_order').on(table.orderId, table.sequence),
]);

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

export const orderTrackingShares = pgTable('order_tracking_shares', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 64 }).unique().notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_share_order').on(table.orderId),
]);

// ─── Order Documents ──────────────────────────────────────

export const orderDocuments = pgTable('order_documents', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  // 'cmr' | 'awb' | 'invoice' | 'proforma' | 'contract' | 'pod' | 'other'
  type: varchar('type', { length: 30 }).notNull(),
  title: varchar('title', { length: 500 }),
  fileUrl: text('file_url').notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  sizeBytes: integer('size_bytes'),
  // Stage of transport when document was added
  stage: varchar('stage', { length: 20 }), // 'pre_load' | 'loaded' | 'in_transit' | 'delivered' | 'post'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_docs_order').on(table.orderId),
  index('idx_docs_type').on(table.type),
]);

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

export const incidentReplies = pgTable('incident_replies', {
  id: text('id').primaryKey(),
  incidentId: text('incident_id').notNull().references(() => incidents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  body: text('body').notNull(),
  attachmentUrl: text('attachment_url'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_incident_replies').on(table.incidentId),
]);

// ─── Company Blacklist ────────────────────────────────────

export const companyBlacklist = pgTable('company_blacklist', {
  ownerCompanyId: text('owner_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  blockedCompanyId: text('blocked_company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  addedBy: text('added_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.ownerCompanyId, table.blockedCompanyId] }),
  index('idx_blacklist_blocked').on(table.blockedCompanyId),
]);

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
});

// ─── Favorites ────────────────────────────────────────────

export const freightFavorites = pgTable('freight_favorites', {
  userId: text('user_id').notNull().references(() => users.id),
  freightId: text('freight_id').notNull().references(() => freight.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.freightId] }),
]);

export const truckFavorites = pgTable('truck_favorites', {
  userId: text('user_id').notNull().references(() => users.id),
  truckId: text('truck_id').notNull().references(() => availableTrucks.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.truckId] }),
]);

export const companyFavorites = pgTable('company_favorites', {
  userId: text('user_id').notNull().references(() => users.id),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.companyId] }),
]);

// ─── Freight Bids (offers on regular freight, not auctions) ──

export const freightBids = pgTable('freight_bids', {
  id: text('id').primaryKey(),
  freightId: text('freight_id').notNull().references(() => freight.id, { onDelete: 'cascade' }),
  bidderUserId: text('bidder_user_id').notNull().references(() => users.id),
  bidderCompanyId: text('bidder_company_id').notNull().references(() => companies.id),
  priceTotal: doublePrecision('price_total').notNull(),
  pricePerKm: doublePrecision('price_per_km'),
  currency: varchar('currency', { length: 5 }).default('EUR'),
  includesTva: boolean('includes_tva').default(false),
  truckTypeId: varchar('truck_type_id', { length: 50 }).references(() => truckTypes.id),
  message: text('message'),
  validUntil: timestamp('valid_until'),
  // 'active' | 'accepted' | 'rejected' | 'withdrawn'
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_freight_bids_freight').on(table.freightId),
  index('idx_freight_bids_bidder').on(table.bidderCompanyId),
]);

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

export const freightDocuments = pgTable('freight_documents', {
  id: text('id').primaryKey(),
  freightId: text('freight_id').notNull().references(() => freight.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 40 }).notNull(), // 'cmr' | 'invoice' | 'photo' | 'other'
  name: varchar('name', { length: 300 }).notNull(),
  url: text('url').notNull(),
  fileSize: integer('file_size'),
  uploadedBy: text('uploaded_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_freight_documents_freight').on(table.freightId),
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
});

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
});

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
});

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

export const invoiceGuarantees = pgTable('invoice_guarantees', {
  id: text('id').primaryKey(),
  buyerCompanyId: text('buyer_company_id').notNull().references(() => companies.id), // cumpără garanția
  buyerUserId: text('buyer_user_id').notNull().references(() => users.id),
  payerCompanyId: text('payer_company_id'), // compania care trebuie să plătească (poate fi necunoscută)
  payerName: varchar('payer_name', { length: 200 }),
  payerCui: varchar('payer_cui', { length: 50 }),
  invoiceNumber: varchar('invoice_number', { length: 100 }).notNull(),
  invoiceDate: timestamp('invoice_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: varchar('currency', { length: 3 }).default('RON'),
  premiumCrb: integer('premium_crb').notNull(), // costul garanției în CRB
  status: varchar('status', { length: 20 }).default('active'), // 'active' | 'paid' | 'claim_filed' | 'reimbursed' | 'expired' | 'cancelled'
  description: text('description'),
  claimedAt: timestamp('claimed_at'),
  reimbursedAt: timestamp('reimbursed_at'),
  reimbursedAmount: doublePrecision('reimbursed_amount'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_guarantee_buyer').on(table.buyerCompanyId),
  index('idx_guarantee_status').on(table.status),
  index('idx_guarantee_due').on(table.dueDate),
]);

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

export const driverCertificates = pgTable('driver_certificates', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 30 }).notNull(), // 'leave' | 'activity' | 'medical' | 'training'
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  reason: text('reason'),
  documentNumber: varchar('document_number', { length: 100 }),
  issuedBy: text('issued_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_driver_cert_driver').on(table.driverId),
  index('idx_driver_cert_type').on(table.type),
]);

// ─── Info articles (Informatii hub: reglementări/formulare/publicații) ──

export const infoArticles = pgTable('info_articles', {
  id: text('id').primaryKey(),
  slug: varchar('slug', { length: 200 }).unique().notNull(),
  category: varchar('category', { length: 50 }).notNull(), // 'reglementari' | 'formulare' | 'publicatii' | 'restrictii' | 'pasi-document'
  titleRo: varchar('title_ro', { length: 500 }).notNull(),
  titleEn: varchar('title_en', { length: 500 }),
  bodyRo: text('body_ro').notNull(),
  bodyEn: text('body_en'),
  attachmentUrl: text('attachment_url'),
  isPublished: boolean('is_published').default(true),
  sortOrder: integer('sort_order').default(0),
  publishedAt: timestamp('published_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_info_category').on(table.category),
]);

// ─── Verify Contact (anti-fraud lookup) ──────────────────

export const flaggedContacts = pgTable('flagged_contacts', {
  id: text('id').primaryKey(),
  contactType: varchar('contact_type', { length: 20 }).notNull(), // 'email' | 'phone' | 'cui' | 'plate'
  contactValue: varchar('contact_value', { length: 200 }).notNull(),
  reason: varchar('reason', { length: 100 }),
  reportedByCompanyId: text('reported_by_company_id'),
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_flagged_value').on(table.contactValue),
  index('idx_flagged_type').on(table.contactType),
]);

// ─── Audit Log ────────────────────────────────────────────

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
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

export const cmrSignatures = pgTable('cmr_signatures', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  party: varchar('party', { length: 20 }).notNull(),
  signedByUserId: text('signed_by_user_id').notNull().references(() => users.id),
  signedByName: varchar('signed_by_name', { length: 255 }).notNull(),
  signaturePng: text('signature_png').notNull(),
  signatureHash: varchar('signature_hash', { length: 64 }).notNull(),
  // Append-only hash chain: each new signature includes the previous
  // signature's hash in its own hash payload, so altering any earlier
  // row invalidates every signature that came after it. Verification
  // logic lives in lib/cmr-chain.ts.
  prevHash: varchar('prev_hash', { length: 64 }),
  // Client-reported timestamp for clock-skew forensics. signedAt below
  // is the trusted server time.
  clientTs: timestamp('client_ts'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  signedAt: timestamp('signed_at').defaultNow(),
}, (table) => [
  index('idx_cmr_sig_order').on(table.orderId),
  index('idx_cmr_sig_party').on(table.party),
]);

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

// ─── HOS / AETR driver hours ─────────────────────────────

export const driverHours = pgTable('driver_hours', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  activity: varchar('activity', { length: 20 }).notNull(),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  durationMinutes: integer('duration_minutes'),
  source: varchar('source', { length: 20 }).default('manual'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_driver_hours_driver').on(table.driverId),
  index('idx_driver_hours_started').on(table.startedAt),
]);

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

export const tachographFiles = pgTable('tachograph_files', {
  id: text('id').primaryKey(),
  driverId: text('driver_id').references(() => drivers.id),
  companyId: text('company_id').notNull().references(() => companies.id),
  uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => users.id),
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 255 }),
  fileSizeBytes: integer('file_size_bytes'),
  fileType: varchar('file_type', { length: 20 }),
  parsed: boolean('parsed').notNull().default(false),
  parseSummary: jsonb('parse_summary'),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
}, (table) => [
  index('idx_tacho_company').on(table.companyId),
  index('idx_tacho_driver').on(table.driverId),
]);

// ─── Multi-currency FX ───────────────────────────────────

export const fxRates = pgTable('fx_rates', {
  baseCurrency: varchar('base_currency', { length: 5 }).notNull(),
  quoteCurrency: varchar('quote_currency', { length: 5 }).notNull(),
  rate: doublePrecision('rate').notNull(),
  fetchedAt: timestamp('fetched_at').notNull(),
  source: varchar('source', { length: 20 }).default('ecb'),
}, (table) => [primaryKey({ columns: [table.baseCurrency, table.quoteCurrency] })]);

// ─── Public tracking links ───────────────────────────────

export const publicTrackingTokens = pgTable('public_tracking_tokens', {
  token: varchar('token', { length: 64 }).primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  // 'view' = public read-only tracking link (default for backward compat).
  // 'ingest' = write-only Bearer token issued to a telematics device.
  scope: varchar('scope', { length: 20 }).notNull().default('view'),
  // Hint for the telematics platform that owns this token (webfleet,
  // frotcom, geotab, manual). Not enforced — purely informational.
  provider: varchar('provider', { length: 40 }),
  expiresAt: timestamp('expires_at'),
  viewsCount: integer('views_count').notNull().default(0),
  lastViewedAt: timestamp('last_viewed_at'),
  lastIngestAt: timestamp('last_ingest_at'),
  ingestCount: integer('ingest_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_tracking_order').on(table.orderId),
  index('idx_tracking_scope').on(table.scope),
]);

// ─── Border crossings ────────────────────────────────────

export const borderCrossings = pgTable('border_crossings', {
  id: text('id').primaryKey(),
  code: varchar('code', { length: 40 }).unique().notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  countryA: varchar('country_a', { length: 5 }).notNull(),
  countryB: varchar('country_b', { length: 5 }).notNull(),
  waitMinutesOutbound: integer('wait_minutes_outbound'),
  waitMinutesInbound: integer('wait_minutes_inbound'),
  measuredAt: timestamp('measured_at'),
  source: varchar('source', { length: 40 }),
});

// ─── Factoring — early payment marketplace ───────────────

export const factoringRequests = pgTable('factoring_requests', {
  id: text('id').primaryKey(),
  invoiceId: text('invoice_id'),
  orderId: text('order_id'),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  requestedByUserId: text('requested_by_user_id').notNull().references(() => users.id),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 5 }).notNull().default('RON'),
  // 'waitlist' | 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled'
  status: varchar('status', { length: 20 }).notNull().default('waitlist'),
  partner: varchar('partner', { length: 50 }),
  feePercent: doublePrecision('fee_percent'),
  expectedPayoutAt: timestamp('expected_payout_at'),
  paidAt: timestamp('paid_at'),
  rejectionReason: text('rejection_reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_factoring_company').on(table.companyId),
  index('idx_factoring_status').on(table.status),
  index('idx_factoring_created').on(table.createdAt),
]);

// ─── Marketplace click tracking ──────────────────────────

export const marketplaceClicks = pgTable('marketplace_clicks', {
  id: text('id').primaryKey(),
  classifiedId: text('classified_id').notNull().references(() => classifieds.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  ipAddress: varchar('ip_address', { length: 64 }),
  clickedAt: timestamp('clicked_at').defaultNow(),
}, (table) => [
  index('idx_mp_clicks_classified').on(table.classifiedId),
  index('idx_mp_clicks_clicked').on(table.clickedAt),
]);

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

export const entityViews = pgTable('entity_views', {
  id: text('id').primaryKey(),
  entityType: varchar('entity_type', { length: 20 }).notNull(), // 'auction' | 'freight' | 'truck' | 'classified'
  entityId: text('entity_id').notNull(),
  viewerUserId: text('viewer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  viewerCompanyId: text('viewer_company_id').references(() => companies.id, { onDelete: 'set null' }),
  viewCount: integer('view_count').notNull().default(1),
  firstViewedAt: timestamp('first_viewed_at').notNull().defaultNow(),
  lastViewedAt: timestamp('last_viewed_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_entity_views_unique').on(table.entityType, table.entityId, table.viewerUserId),
  index('idx_entity_views_entity').on(table.entityType, table.entityId),
  index('idx_entity_views_viewer').on(table.viewerUserId),
]);


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
  // Partial unique (one default per company+kind) is enforced via raw SQL in the migration.
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
]);

// ─── Expeditor module: transport dossiers ────────────────────
// A dossier groups everything about one transport job: client side (PO from
// the customer), carrier side (order to the assigned trucker), the freight
// listing, status events, CMR, invoices. Visible only to the dossier owner;
// the carrier sees a derived order entity from `orders`.
export const transportDossiers = pgTable('transport_dossiers', {
  id: text('id').primaryKey(),
  displayId: varchar('display_id', { length: 32 }).notNull().unique(),
  // Owner = the expeditor / intermediar / client_direct that creates the dossier
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Client side
  clientCompanyId: text('client_company_id').references(() => companies.id, { onDelete: 'set null' }),
  clientExternalId: text('client_external_id').references(() => invoiceClients.id, { onDelete: 'set null' }),
  clientOrderRef: varchar('client_order_ref', { length: 80 }), // PO number from client
  clientPriceCents: integer('client_price_cents'),
  clientCurrency: varchar('client_currency', { length: 5 }).default('RON'),
  clientTaxId: varchar('client_tax_id', { length: 20 }), // CUI/CIF for ANAF VAT lookup
  clientVatPayer: boolean('client_vat_payer'), // null = unchecked, true/false = ANAF result
  // Carrier side
  freightId: text('freight_id').references(() => freight.id, { onDelete: 'set null' }),
  assignedCarrierCompanyId: text('assigned_carrier_company_id').references(() => companies.id, { onDelete: 'set null' }),
  assignedCarrierUserId: text('assigned_carrier_user_id').references(() => users.id, { onDelete: 'set null' }),
  carrierPriceCents: integer('carrier_price_cents'),
  carrierCurrency: varchar('carrier_currency', { length: 5 }).default('RON'),
  carrierOrderId: text('carrier_order_id').references(() => orders.id, { onDelete: 'set null' }),
  // Route snapshot (denormalized for fast list rendering)
  loadingCity: varchar('loading_city', { length: 120 }),
  loadingCountry: varchar('loading_country', { length: 60 }),
  loadingDate: date('loading_date', { mode: 'string' }),
  unloadingCity: varchar('unloading_city', { length: 120 }),
  unloadingCountry: varchar('unloading_country', { length: 60 }),
  unloadingDate: date('unloading_date', { mode: 'string' }),
  weight: doublePrecision('weight'),
  volume: doublePrecision('volume'),
  // Lifecycle
  // 'draft' | 'published' | 'assigned' | 'pickup_scheduled' | 'loaded' | 'in_transit' | 'delivered' | 'closed' | 'cancelled'
  status: varchar('status', { length: 24 }).notNull().default('draft'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_dossiers_company').on(table.companyId),
  index('idx_dossiers_status').on(table.status),
  index('idx_dossiers_freight').on(table.freightId),
  index('idx_dossiers_carrier').on(table.assignedCarrierCompanyId),
]);

// Documents attached to a dossier (CMR, invoices in/out, client PO, carrier
// order). The `kind` lets the UI group them in tabs.
export const dossierDocuments = pgTable('dossier_documents', {
  id: text('id').primaryKey(),
  dossierId: text('dossier_id').notNull().references(() => transportDossiers.id, { onDelete: 'cascade' }),
  // 'cmr' | 'client_po' | 'carrier_order' | 'invoice_in' | 'invoice_out' | 'pod' | 'other'
  kind: varchar('kind', { length: 24 }).notNull(),
  fileUrl: text('file_url').notNull(),
  fileName: varchar('file_name', { length: 200 }),
  uploadedByUserId: text('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
}, (table) => [
  index('idx_dossier_docs_dossier').on(table.dossierId),
]);

// Tracking events on a dossier (sosit la încărcare / încărcat / sosit la
// descărcare / descărcat / etc). Driven by carrier-side status updates; surfaced
// to the client as live tracking.
export const dossierEvents = pgTable('dossier_events', {
  id: text('id').primaryKey(),
  dossierId: text('dossier_id').notNull().references(() => transportDossiers.id, { onDelete: 'cascade' }),
  // 'pickup_arrived' | 'loaded' | 'in_transit' | 'delivery_arrived' | 'delivered' | 'cmr_signed' | 'note'
  kind: varchar('kind', { length: 24 }).notNull(),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  byUserId: text('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_dossier_events_dossier').on(table.dossierId),
  index('idx_dossier_events_kind').on(table.kind),
]);

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
  defaultVatRate: doublePrecision('default_vat_rate').default(19),
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

export const eCmrConsignments = pgTable('e_cmr_consignments', {
  id: text('id').primaryKey(),
  consignmentNo: varchar('consignment_no', { length: 40 }).notNull().unique(),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  createdByUserId: text('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  orderId: text('order_id').references(() => orders.id, { onDelete: 'set null' }),
  dossierId: text('dossier_id').references(() => transportDossiers.id, { onDelete: 'set null' }),
  freightId: text('freight_id').references(() => freight.id, { onDelete: 'set null' }),
  publicToken: varchar('public_token', { length: 48 }).notNull().unique(),

  // Lifecycle: draft | issued | in_transit | delivered | archived | cancelled
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  issuedAt: timestamp('issued_at'),
  inTransitAt: timestamp('in_transit_at'),
  deliveredAt: timestamp('delivered_at'),
  archivedAt: timestamp('archived_at'),
  cancelledAt: timestamp('cancelled_at'),

  // 1. Sender
  senderCompanyId: text('sender_company_id').references(() => companies.id, { onDelete: 'set null' }),
  senderName: varchar('sender_name', { length: 255 }).notNull(),
  senderAddress: text('sender_address'),
  senderCity: varchar('sender_city', { length: 120 }),
  senderCountry: varchar('sender_country', { length: 60 }),
  senderCui: varchar('sender_cui', { length: 40 }),
  // 2. Consignee
  consigneeCompanyId: text('consignee_company_id').references(() => companies.id, { onDelete: 'set null' }),
  consigneeName: varchar('consignee_name', { length: 255 }).notNull(),
  consigneeAddress: text('consignee_address'),
  consigneeCity: varchar('consignee_city', { length: 120 }),
  consigneeCountry: varchar('consignee_country', { length: 60 }),
  consigneeCui: varchar('consignee_cui', { length: 40 }),
  // 3. Place of delivery
  deliveryPlace: varchar('delivery_place', { length: 255 }),
  deliveryCountry: varchar('delivery_country', { length: 60 }),
  deliveryDatePlanned: date('delivery_date_planned', { mode: 'string' }),
  // 4. Place + date of taking over
  takingOverPlace: varchar('taking_over_place', { length: 255 }),
  takingOverCountry: varchar('taking_over_country', { length: 60 }),
  takingOverDatePlanned: date('taking_over_date_planned', { mode: 'string' }),
  // 5. Annexed documents
  annexedDocs: text('annexed_docs'),
  // 6-11. Goods
  marksNumbers: text('marks_numbers'),
  packagesCount: integer('packages_count'),
  packingMethod: varchar('packing_method', { length: 120 }),
  goodsNature: text('goods_nature').notNull(),
  statisticalNumber: varchar('statistical_number', { length: 60 }),
  grossWeightKg: doublePrecision('gross_weight_kg'),
  volumeM3: doublePrecision('volume_m3'),
  // 16/17. Carrier + successive
  carrierCompanyId: text('carrier_company_id').references(() => companies.id, { onDelete: 'set null' }),
  carrierName: varchar('carrier_name', { length: 255 }),
  carrierAddress: text('carrier_address'),
  carrierCountry: varchar('carrier_country', { length: 60 }),
  carrierCui: varchar('carrier_cui', { length: 40 }),
  successiveCarriers: text('successive_carriers'),
  // 13/14
  senderInstructions: text('sender_instructions'),
  carrierReservations: text('carrier_reservations'),
  // 15. COD
  codAmountCents: integer('cod_amount_cents'),
  codCurrency: varchar('cod_currency', { length: 8 }),
  // 19
  specialAgreements: text('special_agreements'),
  // 20
  chargesPaidBy: varchar('charges_paid_by', { length: 20 }),
  freightPriceCents: integer('freight_price_cents'),
  freightCurrency: varchar('freight_currency', { length: 8 }),
  // 21
  establishedAtPlace: varchar('established_at_place', { length: 255 }),
  establishedAtDate: date('established_at_date', { mode: 'string' }),

  // Operational extras
  vehiclePlate: varchar('vehicle_plate', { length: 20 }),
  trailerPlate: varchar('trailer_plate', { length: 20 }),
  driverName: varchar('driver_name', { length: 200 }),
  driverIdDoc: varchar('driver_id_doc', { length: 80 }),
  lastKnownLat: doublePrecision('last_known_lat'),
  lastKnownLng: doublePrecision('last_known_lng'),
  lastKnownAt: timestamp('last_known_at'),

  recipientSignatureRequired: boolean('recipient_signature_required').notNull().default(true),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_ecmr_company').on(table.companyId),
  index('idx_ecmr_status').on(table.status),
  index('idx_ecmr_order').on(table.orderId),
  index('idx_ecmr_dossier').on(table.dossierId),
  index('idx_ecmr_carrier').on(table.carrierCompanyId),
  index('idx_ecmr_consignee').on(table.consigneeCompanyId),
  index('idx_ecmr_issued').on(table.issuedAt),
]);

export const eCmrSignatures = pgTable('e_cmr_signatures', {
  id: text('id').primaryKey(),
  consignmentId: text('consignment_id').notNull().references(() => eCmrConsignments.id, { onDelete: 'cascade' }),
  // 'sender' | 'carrier' | 'recipient'
  party: varchar('party', { length: 20 }).notNull(),
  signedByUserId: text('signed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  signedByName: varchar('signed_by_name', { length: 255 }).notNull(),
  signedByRole: varchar('signed_by_role', { length: 120 }),
  signaturePng: text('signature_png').notNull(),
  signatureHash: varchar('signature_hash', { length: 64 }).notNull(),
  prevHash: varchar('prev_hash', { length: 64 }),
  clientTs: timestamp('client_ts'),
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  signedAt: timestamp('signed_at').defaultNow(),
}, (table) => [
  index('idx_ecmr_sig_consignment').on(table.consignmentId),
  index('idx_ecmr_sig_party').on(table.party),
]);

export const eCmrEvents = pgTable('e_cmr_events', {
  id: text('id').primaryKey(),
  consignmentId: text('consignment_id').notNull().references(() => eCmrConsignments.id, { onDelete: 'cascade' }),
  kind: varchar('kind', { length: 32 }).notNull(),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
  byUserId: text('by_user_id').references(() => users.id, { onDelete: 'set null' }),
  byName: varchar('by_name', { length: 255 }),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  notes: text('notes'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_ecmr_events_consignment').on(table.consignmentId),
  index('idx_ecmr_events_kind').on(table.kind),
]);

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
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_pos_sales_company').on(table.companyId),
  index('idx_pos_sales_created').on(table.companyId, table.createdAt),
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
