// POST /api/anaf/efactura/submit
//
// Body: { invoiceId: string, cif: string }
//   — pulls the stored UBL XML (or generates one), uploads to ANAF,
//     and updates invoices.efactura* fields.
//
// Body alt: { xml: string, cif: string, refId?: invoiceId }
//   — bring-your-own XML (e.g. exported from SmartBill).
import type { APIRoute } from 'astro';
import { uploadInvoice } from '../../../../lib/anaf/efactura-client';
import { db } from '../../../../db';
import { invoices, companies, billingAddresses } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { generateEFacturaXml } from '../../../../lib/efactura';
import { requireRole } from '../../../../lib/require-role';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const companyId = locals.user.companyId;
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Body invalid' }), { status: 400 }); }

  const cif = String(body?.cif || '').replace(/^RO/i, '').replace(/\D/g, '');
  if (!cif) return new Response(JSON.stringify({ error: 'CIF lipsă' }), { status: 400 });

  let xml: string | null = null;
  let invoiceId: string | undefined;

  if (typeof body.xml === 'string' && body.xml.trim().startsWith('<')) {
    xml = body.xml;
    invoiceId = typeof body.refId === 'string' ? body.refId : undefined;
    // IDOR fix: refId is attacker-controlled. If it references an invoice, that
    // invoice MUST belong to the caller's company before we later UPDATE it.
    if (invoiceId) {
      const [inv] = await db.select({ companyId: invoices.companyId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!inv) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
      if (inv.companyId !== companyId) return new Response(JSON.stringify({ error: 'Nu ai acces la factură' }), { status: 403 });
    }
  } else if (typeof body.invoiceId === 'string') {
    invoiceId = body.invoiceId;
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId!)).limit(1);
    if (!inv) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
    if (inv.companyId !== companyId) return new Response(JSON.stringify({ error: 'Nu ai acces la factură' }), { status: 403 });

    if (inv.efacturaXml) {
      xml = inv.efacturaXml;
    } else {
      // Build a minimal UBL invoice from billing addresses. Caller can
      // override by passing `xml` directly when the invoice content is
      // more nuanced (multi-line, foreign customer, etc.).
      const [supplierAddr] = await db.select().from(billingAddresses)
        .where(eq(billingAddresses.companyId, inv.companyId)).limit(1);
      const [supplierCo] = await db.select().from(companies).where(eq(companies.id, inv.companyId)).limit(1);
      if (!supplierAddr || !supplierCo) return new Response(JSON.stringify({ error: 'Lipsesc datele de facturare ale firmei' }), { status: 400 });

      xml = generateEFacturaXml({
        invoiceNumber: inv.invoiceNumber,
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
          name: supplierAddr.legalName, // placeholder — real customer comes from order flow
          cui: cif,
          vatPayer: true,
          address: { street: supplierAddr.address, city: supplierAddr.city, country: supplierAddr.countryCode },
        },
        lines: [{
          description: `Factură ${inv.invoiceNumber}`,
          quantity: 1,
          unit: 'C62',
          unitPriceCents: inv.amountCents,
          vatPercent: (inv.vatCents ?? 0) > 0 ? Math.round(((inv.vatCents ?? 0) / inv.amountCents) * 100) : 0,
        }],
      });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Trimite invoiceId sau xml' }), { status: 400 });
  }

  if (!xml) return new Response(JSON.stringify({ error: 'XML lipsă' }), { status: 400 });

  const result = await uploadInvoice({
    companyId, cif, xml, refId: invoiceId, userId: locals.user.id,
  });

  if (invoiceId && result.ok) {
    await db.update(invoices).set({
      efacturaXml: xml,
      efacturaStatus: 'submitted',
      efacturaSubmittedAt: new Date(),
      efacturaAnafId: result.spvIndex || null,
      efacturaError: null,
    }).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
  } else if (invoiceId && !result.ok) {
    await db.update(invoices).set({
      efacturaStatus: 'rejected',
      efacturaError: result.error || 'unknown',
    }).where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId)));
  }

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
};
