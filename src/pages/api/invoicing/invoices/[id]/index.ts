// GET /api/invoicing/invoices/[id] — single invoice with its lines, used to
// prefill the emit form when copying ("Copiază") an existing document.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines } from '../../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices)
    .where(and(eq(transportInvoices.id, params.id!), eq(transportInvoices.companyId, cid)))
    .limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });

  const lines = await db.select().from(transportInvoiceLines)
    .where(eq(transportInvoiceLines.invoiceId, inv.id))
    .orderBy(asc(transportInvoiceLines.position));

  return new Response(JSON.stringify({ invoice: inv, lines }), { headers: { 'Content-Type': 'application/json' } });
};
