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
  if (inv.clientExternalId) {
    const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId)).limit(1);
    if (c) {
      customerCountry = (c.country || 'Romania').toLowerCase().startsWith('rom') ? 'RO' : c.country!.slice(0, 2).toUpperCase();
      customerCity = c.city || '';
      customerStreet = c.address || customerStreet;
    }
  }

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
      cui: ((inv.clientTaxIdSnap || '').replace(/^RO/i, '').replace(/\D/g, '') || ''),
      vatPayer: !!inv.clientTaxIdSnap,
      address: { street: customerStreet || '—', city: customerCity || '—', country: customerCountry },
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
