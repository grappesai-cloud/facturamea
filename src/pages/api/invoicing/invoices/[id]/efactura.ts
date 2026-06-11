// POST /api/invoicing/invoices/[id]/efactura — submit a transport_invoices
// row to ANAF SPV. Mirrors /api/anaf/efactura/submit but reads from the new
// table and rebuilds UBL XML from transport_invoice_lines (line-accurate,
// unlike the platform-billing version which only has a single amount).
import type { APIRoute } from 'astro';
import { uploadInvoice } from '../../../../../lib/anaf/efactura-client';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines, companies, billingAddresses, invoiceClients } from '../../../../../db/schema';
import { eq, asc } from 'drizzle-orm';
import { generateEFacturaXml } from '../../../../../lib/efactura';

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const invoiceId = params.id as string;
  if (!invoiceId) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
  if (inv.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });
  if (inv.kind !== 'factura' && inv.kind !== 'storno') return new Response(JSON.stringify({ error: 'Doar facturile/storno se trimit la SPV' }), { status: 400 });

  const lines = await db.select().from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, invoiceId)).orderBy(asc(transportInvoiceLines.position));
  const [supplierAddr] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, inv.companyId)).limit(1);
  const [supplierCo] = await db.select().from(companies).where(eq(companies.id, inv.companyId)).limit(1);
  if (!supplierAddr || !supplierCo) return new Response(JSON.stringify({ error: 'Lipsesc datele de facturare (adresa firmei)' }), { status: 400 });

  const cif = String(supplierCo.cui || '').replace(/^RO/i, '').replace(/\D/g, '');
  if (!cif) return new Response(JSON.stringify({ error: 'CIF firmă invalid' }), { status: 400 });

  // Build customer block from snapshot + (if available) the linked external client.
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

  const xml = inv.efacturaXml || generateEFacturaXml({
    invoiceNumber: inv.fullNumber,
    issueDate: (inv.issuedAt || new Date()).toISOString().slice(0, 10),
    dueDate: (inv.dueAt || inv.issuedAt || new Date()).toISOString().slice(0, 10),
    currency: inv.currency || 'RON',
    supplier: {
      name: supplierAddr.legalName,
      cui: cif,
      vatPayer: true,
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
      unit: l.unit === 'buc' ? 'C62' : l.unit,
      unitPriceCents: l.unitPriceCents,
      vatPercent: l.vatRate,
    })),
  });

  const result = await uploadInvoice({
    companyId: inv.companyId, cif, xml, refId: invoiceId, userId: locals.user.id,
  });

  if (result.ok) {
    await db.update(transportInvoices).set({
      efacturaXml: xml,
      efacturaStatus: 'submitted',
      efacturaSubmittedAt: new Date(),
      efacturaAnafId: result.spvIndex || null,
      efacturaError: null,
      updatedAt: new Date(),
    }).where(eq(transportInvoices.id, invoiceId));
  } else {
    await db.update(transportInvoices).set({
      efacturaStatus: 'rejected',
      efacturaError: result.error || 'unknown',
      updatedAt: new Date(),
    }).where(eq(transportInvoices.id, invoiceId));
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
};
