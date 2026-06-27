import { z, type ZodTypeAny } from 'zod';

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

export async function validateBody<T extends ZodTypeAny>(
  request: Request,
  schema: T
): Promise<ValidationResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'JSON invalid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '_';
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: 'Date invalide', fields: fieldErrors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

const optStr = z.string().optional().nullable();
const optNum = z.number().optional().nullable();
const optInt = z.number().int().optional().nullable();

// Freight POST (matches /api/freight POST body)
export const freightCreateSchema = z.object({
  loadingCityId: optInt,
  loadingCityName: z.string().min(1).max(120),
  loadingCountry: z.string().min(2).max(80),
  loadingPostal: optStr,
  unloadingCityId: optInt,
  unloadingCityName: z.string().min(1).max(120),
  unloadingCountry: z.string().min(2).max(80),
  unloadingPostal: optStr,
  loadingDate: z.string().min(1),
  loadingDateEnd: optStr,
  weight: optNum,
  volume: optNum,
  quantity: optInt,
  description: z.string().max(2000).optional().nullable(),
  distanceKm: optNum,
  isFullTruck: z.boolean().optional(),
  priceTotal: optNum,
  currency: z.string().min(3).max(3).optional(),
  includesTva: z.boolean().optional(),
  contractType: z.enum(['spot', 'long_term']).optional(),
  contractMonths: optInt,
  contractFrequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'on_demand']).optional().nullable(),
  truckTypes: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
}).passthrough();

// Truck POST
export const truckCreateSchema = z.object({
  departureCityName: z.string().min(1).max(120),
  departureCountry: z.string().min(2).max(80),
  destinationCityName: optStr,
  destinationCountry: optStr,
  availableFrom: z.string().min(1),
  availableUntil: optStr,
  truckTypeId: optStr,
  capacityKg: optNum,
  capacityM3: optNum,
  notes: z.string().max(2000).optional().nullable(),
  contractType: z.enum(['spot', 'long_term']).optional(),
}).passthrough();

// Auction POST
export const auctionCreateSchema = z.object({
  loadingCityName: z.string().min(1).max(120),
  loadingCountry: z.string().min(2).max(80),
  unloadingCityName: z.string().min(1).max(120),
  unloadingCountry: z.string().min(2).max(80),
  loadingDate: z.string().min(1),
  startingPrice: z.number().nonnegative().optional().nullable(),
  reservePrice: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(3).optional(),
  endsAt: z.string().min(1),
  awardMode: z.enum(['manual', 'auto']).optional(),
  description: z.string().max(2000).optional().nullable(),
}).passthrough();

// Freight bid POST (/api/freight-bids)
export const freightBidCreateSchema = z.object({
  freightId: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().min(3).max(3).optional(),
  message: z.string().max(1000).optional().nullable(),
  validUntil: z.string().optional().nullable(),
}).passthrough();

// Auction bid POST
export const auctionBidCreateSchema = z.object({
  amount: z.number().nonnegative(),
  message: z.string().max(1000).optional().nullable(),
}).passthrough();

// Incident POST
export const incidentCreateSchema = z.object({
  againstCompanyId: z.string().min(1),
  category: z.enum(['payment_delay', 'damaged_cargo', 'late_delivery', 'no_show', 'document_issue', 'fraud', 'other']),
  title: z.string().min(3).max(200),
  body: z.string().min(10).max(5000),
  claimedAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().min(3).max(3).nullable().optional(),
  orderId: z.string().nullable().optional(),
}).passthrough();

// Message POST
export const messageCreateSchema = z.object({
  conversationId: z.string().optional(),
  recipientUserId: z.string().optional(),
  recipientCompanyId: z.string().optional(),
  body: z.string().min(1).max(5000),
  contextType: z.string().optional(),
  contextId: z.string().optional(),
  subject: z.string().optional().nullable(),
}).passthrough().refine(
  (d) => d.conversationId || d.recipientUserId || d.recipientCompanyId,
  { message: 'Trebuie specificat un destinatar sau o conversație' }
);

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
}).passthrough();

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  userType: z.enum(['transportator', 'intermediar', 'client_direct', 'partener']),
  phone: z.string().optional(),
  companyName: z.string().min(2).max(200),
  cui: z.string().optional(),
  country: z.string().min(2).max(80),
  city: z.string().optional(),
  companyPhone: z.string().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Order lifecycle schemas
// ---------------------------------------------------------------------------

export const orderStatusUpdateSchema = z.object({
  status: z.enum(['open', 'accepted', 'loaded', 'in_transit', 'delivered', 'closed', 'refused']),
  vehiclePlate: z.string().max(50).optional().nullable(),
  driverName: z.string().max(120).optional().nullable(),
  driverPhone: z.string().max(40).optional().nullable(),
}).passthrough();

export const orderRateSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().nullable(),
  toUserId: z.string().optional().nullable(),
  toCompanyId: z.string().optional().nullable(),
  punctuality: z.number().int().min(1).max(5).optional(),
  communication: z.number().int().min(1).max(5).optional(),
  cargoCondition: z.number().int().min(1).max(5).optional(),
  documentation: z.number().int().min(1).max(5).optional(),
  paymentReliability: z.number().int().min(1).max(5).optional(),
}).passthrough();

export const orderDocumentCreateSchema = z.object({
  fileUrl: z.string().min(1).max(2000),
  type: z.enum(['cmr', 'awb', 'invoice', 'proforma', 'contract', 'pod', 'other']).optional(),
  title: z.string().max(300).optional().nullable(),
  mimeType: z.string().max(120).optional().nullable(),
  sizeBytes: z.number().int().nonnegative().optional().nullable(),
  stage: z.string().max(60).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).passthrough();

export const orderSignCmrSchema = z.object({
  party: z.enum(['sender', 'carrier', 'receiver']),
  signaturePng: z.string().min(1).max(220_000),
  signedByName: z.string().max(200).optional(),
  // Client-reported signing time (Date.now ISO) for clock-skew forensics.
  clientTs: z.string().datetime().optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// e-CMR (electronic Consignment Note) schemas
// ---------------------------------------------------------------------------

const ecmrOptStr = (max: number) => z.string().max(max).optional().nullable();

export const ecmrCreateSchema = z.object({
  // Optional linkage
  orderId: z.string().max(40).optional().nullable(),
  dossierId: z.string().max(40).optional().nullable(),
  freightId: z.string().max(40).optional().nullable(),

  // 1. Sender — only the name is strictly required
  senderName: z.string().min(1).max(255),
  senderCompanyId: z.string().max(40).optional().nullable(),
  senderAddress: ecmrOptStr(2000),
  senderCity: ecmrOptStr(120),
  senderCountry: ecmrOptStr(60),
  senderCui: ecmrOptStr(40),

  // 2. Consignee
  consigneeName: z.string().min(1).max(255),
  consigneeCompanyId: z.string().max(40).optional().nullable(),
  consigneeAddress: ecmrOptStr(2000),
  consigneeCity: ecmrOptStr(120),
  consigneeCountry: ecmrOptStr(60),
  consigneeCui: ecmrOptStr(40),

  // 3-4
  deliveryPlace: ecmrOptStr(255),
  deliveryCountry: ecmrOptStr(60),
  deliveryDatePlanned: ecmrOptStr(20),
  takingOverPlace: ecmrOptStr(255),
  takingOverCountry: ecmrOptStr(60),
  takingOverDatePlanned: ecmrOptStr(20),

  // 5-11
  annexedDocs: ecmrOptStr(2000),
  marksNumbers: ecmrOptStr(2000),
  packagesCount: optInt,
  packingMethod: ecmrOptStr(120),
  goodsNature: z.string().min(1).max(2000),
  statisticalNumber: ecmrOptStr(60),
  grossWeightKg: optNum,
  volumeM3: optNum,

  // 16/17
  carrierName: ecmrOptStr(255),
  carrierCompanyId: z.string().max(40).optional().nullable(),
  carrierAddress: ecmrOptStr(2000),
  carrierCountry: ecmrOptStr(60),
  carrierCui: ecmrOptStr(40),
  successiveCarriers: ecmrOptStr(2000),

  // 13/14
  senderInstructions: ecmrOptStr(2000),
  carrierReservations: ecmrOptStr(2000),

  // 15
  codAmountCents: optInt,
  codCurrency: ecmrOptStr(8),

  // 19/20
  specialAgreements: ecmrOptStr(2000),
  chargesPaidBy: z.enum(['sender', 'consignee', 'split']).optional().nullable(),
  freightPriceCents: optInt,
  freightCurrency: ecmrOptStr(8),

  // 21
  establishedAtPlace: ecmrOptStr(255),
  establishedAtDate: ecmrOptStr(20),

  // Operational
  vehiclePlate: ecmrOptStr(20),
  trailerPlate: ecmrOptStr(20),
  driverName: ecmrOptStr(200),
  driverIdDoc: ecmrOptStr(80),
  recipientSignatureRequired: z.boolean().optional(),

  // Start in draft unless caller asks to issue immediately
  issueImmediately: z.boolean().optional(),
}).passthrough();

export const ecmrUpdateSchema = ecmrCreateSchema.partial();

export const ecmrSignSchema = z.object({
  party: z.enum(['sender', 'carrier', 'recipient']),
  signaturePng: z.string().min(1).max(220_000),
  signedByName: z.string().min(1).max(200),
  signedByRole: z.string().max(120).optional().nullable(),
  clientTs: z.string().datetime().optional().nullable(),
}).passthrough();

export const ecmrPublicSignSchema = z.object({
  signaturePng: z.string().min(1).max(220_000),
  signedByName: z.string().min(1).max(200),
  signedByRole: z.string().max(120).optional().nullable(),
  clientTs: z.string().datetime().optional().nullable(),
}).passthrough();

export const ecmrTransitSchema = z.object({
  action: z.enum(['issue', 'start', 'deliver', 'archive', 'cancel']),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).passthrough();

const positionPointSchema = z.object({
  lat: z.union([z.number(), z.string()]),
  lng: z.union([z.number(), z.string()]),
  speedKmh: z.number().optional().nullable(),
  headingDeg: z.number().optional().nullable(),
  accuracyM: z.number().optional().nullable(),
  source: z.string().max(40).optional().nullable(),
  recordedAt: z.string().optional().nullable(),
}).passthrough();

export const orderPositionsCreateSchema = z.object({
  points: z.array(positionPointSchema).optional(),
  lat: z.union([z.number(), z.string()]).optional(),
  lng: z.union([z.number(), z.string()]).optional(),
  speedKmh: z.number().optional().nullable(),
  headingDeg: z.number().optional().nullable(),
  accuracyM: z.number().optional().nullable(),
  source: z.string().max(40).optional().nullable(),
  recordedAt: z.string().optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Auction schemas (per-id endpoints)
// ---------------------------------------------------------------------------

export const auctionBidPostSchema = z.object({
  priceTotal: z.union([z.number(), z.string()]),
  pricePerKm: z.number().optional().nullable(),
  currency: z.string().min(3).max(3).optional(),
  includesTva: z.boolean().optional(),
  truckTypeId: z.string().optional().nullable(),
  message: z.string().max(1000).optional().nullable(),
  validUntil: z.string().optional().nullable(),
}).passthrough();

export const auctionAwardSchema = z.object({
  bidId: z.string().optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Classifieds / forum
// ---------------------------------------------------------------------------

export const classifiedCreateSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().min(1).max(5000),
  category: z.string().min(1).max(80),
  price: z.number().nonnegative().optional().nullable(),
  currency: z.string().min(3).max(3).optional(),
  locationCity: z.string().max(120).optional().nullable(),
  locationCountry: z.string().max(80).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
}).passthrough();

export const forumThreadCreateSchema = z.object({
  title: z.string().min(3).max(300),
  body: z.string().min(1).max(20000),
}).passthrough();

export const forumReplyCreateSchema = z.object({
  body: z.string().min(1).max(20000),
}).passthrough();

// ---------------------------------------------------------------------------
// Fleet & sub-users
// ---------------------------------------------------------------------------

export const driverCreateSchema = z.object({
  fullName: z.string().min(2).max(200),
  cnp: z.string().max(40).optional().nullable(),
  licenseNumber: z.string().max(80).optional().nullable(),
  licenseCategories: z.string().max(80).optional().nullable(),
  licenseExpiresAt: z.string().optional().nullable(),
  cardTachoNumber: z.string().max(80).optional().nullable(),
  cardTachoExpiresAt: z.string().optional().nullable(),
  cqcExpiresAt: z.string().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(200).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).passthrough();

export const subUserInviteSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  phone: z.string().max(40).optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Route alerts
// ---------------------------------------------------------------------------

export const routeAlertCreateSchema = z.object({
  type: z.enum(['freight', 'truck', 'auction']),
  name: z.string().max(200).optional().nullable(),
  loadingCountry: z.string().max(80).optional().nullable(),
  loadingCity: z.string().max(120).optional().nullable(),
  unloadingCountry: z.string().max(80).optional().nullable(),
  unloadingCity: z.string().max(120).optional().nullable(),
  truckTypeId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Factoring
// ---------------------------------------------------------------------------

export const factoringRequestSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  amountCents: z.union([z.number(), z.string()]).optional(),
  currency: z.string().min(3).max(3).optional(),
  orderId: z.string().optional().nullable(),
}).passthrough();

export const factoringQuoteSchema = z.object({
  amountCents: z.union([z.number(), z.string()]),
  currency: z.string().min(3).max(3).optional(),
  daysUntilDue: z.number().int().optional().nullable(),
  payerCompanyId: z.string().optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export const companyBrandingUpdateSchema = z.object({
  logoUrl: z.string().max(2000).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  website: z.string().max(2000).optional().nullable(),
}).passthrough();

export const companyLocationCreateSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(120),
  countryCode: z.string().min(2).max(8),
  type: z.string().max(40).optional(),
  address: z.string().max(500).optional().nullable(),
  postalCode: z.string().max(40).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  openingHours: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isPrimary: z.boolean().optional(),
}).passthrough();

// ---------------------------------------------------------------------------
// Blacklist / credits
// ---------------------------------------------------------------------------

export const blacklistAddSchema = z.object({
  blockedCompanyId: z.string().min(1),
  reason: z.string().max(2000).optional().nullable(),
}).passthrough();

export const creditsConsumeSchema = z.object({
  serviceCode: z.string().min(1).max(80),
  reference: z.string().max(200).optional().nullable(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
}).passthrough();

// ---------------------------------------------------------------------------
// Invoicing
// ---------------------------------------------------------------------------

const invoiceLineSchema = z.object({
  description: z.string().min(1).max(1000),
  quantity: z.union([z.number(), z.string()]),
  unit: z.string().max(40).optional().nullable(),
  unitPriceCents: z.union([z.number(), z.string()]),
  vatRate: z.union([z.number(), z.string()]),
}).passthrough();

export const invoiceCreateSchema = z.object({
  kind: z.enum(['factura', 'proforma', 'storno', 'chitanta', 'aviz']),
  seriesId: z.string().optional().nullable(),
  lines: z.array(invoiceLineSchema).min(1),
  clientCompanyId: z.string().optional().nullable(),
  clientExternalId: z.string().optional().nullable(),
  clientName: z.string().max(300).optional().nullable(),
  clientTaxId: z.string().max(80).optional().nullable(),
  clientAddress: z.string().max(500).optional().nullable(),
  orderId: z.string().optional().nullable(),
  parentInvoiceId: z.string().optional().nullable(),
  modelId: z.string().optional().nullable(),
  currency: z.string().max(5).optional(),
  vatRegime: z.string().max(40).optional(),
  notes: z.string().max(5000).optional().nullable(),
  dueAt: z.string().optional().nullable(),
  issueImmediately: z.boolean().optional(),
}).passthrough();

// Pre-launch waitlist (early-access lead capture from landing page)
export const waitlistSignupSchema = z.object({
  name: z.string().min(2, 'Nume prea scurt').max(120),
  email: z.string().email('Email invalid').max(200),
  phone: z.string().max(40).optional().or(z.literal('')),
  companyName: z.string().max(200).optional().or(z.literal('')),
  companyType: z.enum(['transportator', 'expeditie', 'client', 'partener'], {
    message: 'Selectează tipul de companie',
  }),
  acceptedTc: z.literal(true, { message: 'Trebuie să accepți Termenii și Condițiile' }),
  acceptedGdpr: z.literal(true, { message: 'Trebuie să accepți Politica de Confidențialitate (GDPR)' }),
}).strict();
