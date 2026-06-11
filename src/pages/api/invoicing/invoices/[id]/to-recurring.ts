// POST /api/invoicing/invoices/[id]/to-recurring
// "Transformă în recurentă" — creates an invoiceRecurring schedule from an
// existing invoice's client + lines. Body: { frequency?, paymentTermDays? }.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, transportInvoiceLines, invoiceRecurring, invoiceClients } from '../../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const FREQ = new Set(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices)
    .where(and(eq(transportInvoices.id, params.id!), eq(transportInvoices.companyId, cid)))
    .limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });
  if (inv.kind !== 'factura' && inv.kind !== 'proforma') {
    return new Response(JSON.stringify({ error: 'Doar facturile/proformele pot deveni recurente' }), { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as any;
  const frequency = FREQ.has(body.frequency) ? body.frequency : 'monthly';

  const lines = await db.select().from(transportInvoiceLines)
    .where(eq(transportInvoiceLines.invoiceId, inv.id))
    .orderBy(asc(transportInvoiceLines.position));

  // Recipient email for the auto-send (external client) if available.
  let recipientEmail: string | null = null;
  if (inv.clientExternalId) {
    const [c] = await db.select({ email: invoiceClients.email }).from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId)).limit(1);
    recipientEmail = c?.email || null;
  }

  const startAt = new Date().toISOString().slice(0, 10);
  const id = nanoid();
  await db.insert(invoiceRecurring).values({
    id, companyId: cid,
    clientCompanyId: inv.clientCompanyId,
    clientExternalId: inv.clientExternalId,
    name: `Recurentă · ${inv.clientNameSnap}`,
    frequency,
    startAt,
    nextRunAt: startAt,
    seriesId: inv.seriesId,
    currency: inv.currency,
    vatRegime: inv.vatRegime || 'standard',
    linesJson: JSON.stringify(lines.map((l) => ({
      code: l.code, description: l.description, quantity: l.quantity, unit: l.unit,
      unitPriceCents: l.unitPriceCents, vatRate: l.vatRate,
    }))),
    paymentTermDays: body.paymentTermDays != null ? Number(body.paymentTermDays) : 30,
    sendEmail: !!recipientEmail,
    recipientEmail,
    createdByUserId: locals.user.id,
  } as any);

  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
