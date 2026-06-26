// Shared e-Factura submit flow. Used by:
//  - POST /api/invoicing/invoices/[id]/efactura  (instant / manual button)
//  - POST /api/invoicing/invoices                (auto-send on create)
//  - the e-Factura page bulk "Trimite acum"
// Rebuilds line-accurate UBL XML and uploads to ANAF SPV, then persists status.
import { uploadInvoice } from './anaf/efactura-client';
import { db } from '../db';
import { transportInvoices, transportInvoiceLines, companies, billingAddresses, invoiceClients } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { generateEFacturaXml } from './efactura';

export type SubmitResult =
  | { ok: true; spvIndex?: string | null }
  | { ok: false; error: string; reason?: 'precondition' | 'anaf' };

// Submit a single invoice to ANAF SPV. Caller is responsible for auth/ownership.
export async function submitInvoiceToAnaf(invoiceId: string, opts: { userId: string; force?: boolean }): Promise<SubmitResult> {
  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv) return { ok: false, error: 'Factura nu există', reason: 'precondition' };
  if (inv.kind !== 'factura' && inv.kind !== 'storno') return { ok: false, error: 'Doar facturile/storno se trimit la SPV', reason: 'precondition' };
  // Server-side duplicate-submission guard (the UI button is not enough — a direct
  // API call could re-upload). Re-send only from a failed state, or when forced.
  if (!opts.force && (inv.efacturaStatus === 'submitted' || inv.efacturaStatus === 'validated')) {
    return { ok: false, error: 'Factura a fost deja trimisă la ANAF.', reason: 'precondition' };
  }

  const lines = await db.select().from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, invoiceId)).orderBy(asc(transportInvoiceLines.position));
  const [supplierAddr] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, inv.companyId)).limit(1);
  const [supplierCo] = await db.select().from(companies).where(eq(companies.id, inv.companyId)).limit(1);
  if (!supplierAddr || !supplierCo) return { ok: false, error: 'Lipsesc datele de facturare (adresa firmei)', reason: 'precondition' };

  const cif = String(supplierCo.cui || '').replace(/^RO/i, '').replace(/\D/g, '');
  if (!cif) return { ok: false, error: 'CIF firmă invalid', reason: 'precondition' };

  // Real VAT-payer status (from ANAF at onboarding) — never hardcode. A non-payer
  // issues without VAT and the e-Factura must not declare a VAT scheme.
  const supplierVatPayer = (supplierCo as any).isVatPayer === true;
  // Invoice VAT regime → EN16931 category (only for VAT payers; non-payers = O).
  const regimeCategory = ({
    reverse_charge: 'AE', intra_eu: 'K', export_extra_eu: 'G', exempt: 'E',
  } as Record<string, 'AE' | 'K' | 'G' | 'E'>)[inv.vatRegime || 'standard'];

  let customerCountry = 'RO';
  let customerCity = '';
  let customerStreet = inv.clientAddressSnap || '';
  let customerCounty = '';
  let customerPostal = '';
  if (inv.clientExternalId) {
    const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId)).limit(1);
    if (c) {
      customerCountry = countryToIso(c.country);
      customerCity = c.city || '';
      customerStreet = c.address || customerStreet;
      customerCounty = c.county || '';
      customerPostal = c.postalCode || '';
    }
  }
  // A buyer with a tax id gets a PartyTaxScheme; the id is prefixed with the buyer's
  // OWN country code (RO123… for RO, AE…/DE… for foreign) — never hard-coded "RO",
  // which made ANAF reject a foreign id as an invalid RO CUI.
  const customerHasTaxId = !!inv.clientTaxIdSnap;
  const customerIsRo = customerCountry === 'RO';

  // Storno: reference the original invoice (BG-3 / BillingReference) so ANAF links them.
  let precedingInvoiceRef: { number: string; issueDate: string } | undefined;
  if (inv.kind === 'storno' && inv.parentInvoiceId) {
    const [parent] = await db.select({ fullNumber: transportInvoices.fullNumber, issuedAt: transportInvoices.issuedAt })
      .from(transportInvoices).where(eq(transportInvoices.id, inv.parentInvoiceId)).limit(1);
    if (parent) precedingInvoiceRef = { number: parent.fullNumber, issueDate: (parent.issuedAt || new Date()).toISOString().slice(0, 10) };
  }

  // Always regenerate from current data — never reuse a cached (possibly invalid) XML.
  const xml = generateEFacturaXml({
    invoiceNumber: inv.fullNumber,
    issueDate: (inv.issuedAt || new Date()).toISOString().slice(0, 10),
    dueDate: (inv.dueAt || inv.issuedAt || new Date()).toISOString().slice(0, 10),
    currency: inv.currency || 'RON',
    precedingInvoiceRef,
    supplierVatPayer,
    supplier: {
      name: supplierAddr.legalName,
      cui: cif,
      vatPayer: supplierVatPayer,
      registrationNumber: supplierAddr.regCom || undefined,
      address: { street: supplierAddr.address, city: supplierAddr.city, postalCode: supplierAddr.postalCode || undefined, country: supplierAddr.countryCode },
    },
    customer: {
      name: inv.clientNameSnap,
      // RO buyer: strip to digits (partyXml prefixes "RO"). Foreign: keep raw id
      // (partyXml prefixes the foreign country code, e.g. AE…).
      cui: customerIsRo
        ? ((inv.clientTaxIdSnap || '').replace(/^RO/i, '').replace(/\D/g, '') || '')
        // Foreign: strip a leading country prefix if the VAT id already carries it
        // (e.g. "DE811128135"), else partyXml would double it → "DEDE811128135".
        : ((inv.clientTaxIdSnap || '').replace(/\s/g, '').replace(new RegExp('^' + customerCountry, 'i'), '') || ''),
      vatPayer: customerHasTaxId,
      address: { street: customerStreet || '—', city: customerCity || '—', country: customerCountry, postalCode: customerPostal || undefined, countrySubentity: customerCounty || undefined },
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      // Map the invoice's VAT regime to the EN16931 category. Special regimes
      // (reverse charge / intra-EU / export / exempt) carry 0% + their category;
      // standard keeps the line rate (→ S/Z). Non-payers are forced to O upstream.
      vatPercent: supplierVatPayer ? (regimeCategory ? 0 : l.vatRate) : 0,
      vatCategory: supplierVatPayer ? regimeCategory : undefined,
    })),
  });

  const result = await uploadInvoice({ companyId: inv.companyId, cif, xml, refId: invoiceId, userId: opts.userId });

  if (result.ok) {
    await db.update(transportInvoices).set({
      efacturaXml: xml,
      efacturaStatus: 'submitted',
      efacturaSubmittedAt: new Date(),
      efacturaAnafId: result.spvIndex || null,
      efacturaError: null,
      updatedAt: new Date(),
    }).where(eq(transportInvoices.id, invoiceId));
    return { ok: true, spvIndex: result.spvIndex || null };
  }

  await db.update(transportInvoices).set({
    efacturaStatus: 'rejected',
    efacturaError: result.error || 'unknown',
    updatedAt: new Date(),
  }).where(eq(transportInvoices.id, invoiceId));
  return { ok: false, error: result.error || 'unknown', reason: 'anaf' };
}

// Resolve a free-text country (name or code) to an ISO 3166-1 alpha-2 code.
// ANAF (BR-CL-14) requires a valid ISO code; e.g. "United Arab Emirates" -> "AE",
// never "UN" (the old naive slice(0,2)). Already-2-letter codes pass through.
function countryToIso(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return 'RO';
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const k = s.toLowerCase().replace(/[.\-_]/g, ' ').replace(/\s+/g, ' ').trim();
  const MAP: Record<string, string> = {
    'romania': 'RO', 'românia': 'RO',
    'united arab emirates': 'AE', 'emiratele arabe unite': 'AE', 'uae': 'AE', 'emirates': 'AE',
    'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'statele unite': 'US',
    'united kingdom': 'GB', 'great britain': 'GB', 'uk': 'GB', 'marea britanie': 'GB', 'anglia': 'GB',
    'switzerland': 'CH', 'elvetia': 'CH', 'elveția': 'CH',
    'germany': 'DE', 'germania': 'DE', 'deutschland': 'DE',
    'france': 'FR', 'franta': 'FR', 'franța': 'FR',
    'italy': 'IT', 'italia': 'IT', 'spain': 'ES', 'spania': 'ES', 'espana': 'ES',
    'netherlands': 'NL', 'olanda': 'NL', 'belgium': 'BE', 'belgia': 'BE',
    'austria': 'AT', 'poland': 'PL', 'polonia': 'PL', 'portugal': 'PT', 'portugalia': 'PT',
    'ireland': 'IE', 'irlanda': 'IE', 'greece': 'GR', 'grecia': 'GR', 'sweden': 'SE', 'suedia': 'SE',
    'denmark': 'DK', 'danemarca': 'DK', 'finland': 'FI', 'finlanda': 'FI', 'norway': 'NO', 'norvegia': 'NO',
    'hungary': 'HU', 'ungaria': 'HU', 'bulgaria': 'BG', 'czechia': 'CZ', 'czech republic': 'CZ', 'cehia': 'CZ',
    'slovakia': 'SK', 'slovacia': 'SK', 'slovenia': 'SI', 'croatia': 'HR', 'croatia ': 'HR', 'croația': 'HR',
    'luxembourg': 'LU', 'luxemburg': 'LU', 'cyprus': 'CY', 'cipru': 'CY', 'malta': 'MT',
    'estonia': 'EE', 'latvia': 'LV', 'letonia': 'LV', 'lithuania': 'LT', 'lituania': 'LT',
    'moldova': 'MD', 'republica moldova': 'MD', 'ukraine': 'UA', 'ucraina': 'UA', 'turkey': 'TR', 'turcia': 'TR',
    'canada': 'CA', 'australia': 'AU', 'china': 'CN', 'japan': 'JP', 'japonia': 'JP', 'india': 'IN',
    'saudi arabia': 'SA', 'arabia saudita': 'SA', 'qatar': 'QA', 'kuwait': 'KW', 'bahrain': 'BH', 'oman': 'OM',
    'israel': 'IL', 'egypt': 'EG', 'egipt': 'EG', 'singapore': 'SG', 'hong kong': 'HK',
  };
  if (MAP[k]) return MAP[k];
  if (k.startsWith('rom')) return 'RO';
  if (k.includes('arab emirates') || k.includes('emirat')) return 'AE';
  return s.slice(0, 2).toUpperCase(); // last-resort (legacy behaviour)
}
