// POST /api/invoicing/invoices/[id]/efactura — submit a transport_invoices
// row to ANAF SPV (instant / manual send). Delegates the work to the shared
// submitInvoiceToAnaf helper (also used by auto-send on create).
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { submitInvoiceToAnaf } from '../../../../../lib/efactura-submit';
import { requireRole } from '../../../../../lib/require-role';

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  const invoiceId = params.id as string;
  if (!invoiceId) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const [inv] = await db.select({ companyId: transportInvoices.companyId }).from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factura nu există' }), { status: 404 });
  if (inv.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });

  const result = await submitInvoiceToAnaf(invoiceId, { userId: locals.user.id });
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
};
