// Sales orders (comenzi clienți) — list + create.
//
// A sales order is a pre-invoice commitment. Lines mirror invoice lines
// (qty, unit price in cents, vat rate). Totals are computed server-side.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { salesOrders, salesOrderLines, invoiceClients } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

const VALID_STATUS = ['draft', 'confirmed', 'invoiced', 'delivered', 'canceled'];

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const status = url.searchParams.get('status')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(salesOrders.companyId, cid)];
    if (status && VALID_STATUS.includes(status)) conds.push(eq(salesOrders.status, status));
    results = await db
      .select({
        id: salesOrders.id,
        number: salesOrders.number,
        clientExternalId: salesOrders.clientExternalId,
        clientNameSnap: salesOrders.clientNameSnap,
        orderDate: salesOrders.orderDate,
        currency: salesOrders.currency,
        totalCents: salesOrders.totalCents,
        status: salesOrders.status,
        invoiceId: salesOrders.invoiceId,
        createdAt: salesOrders.createdAt,
      })
      .from(salesOrders)
      .where(and(...conds))
      .orderBy(desc(salesOrders.createdAt))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

interface LineInput { productId?: string | null; name?: string; quantity?: number; unitPriceCents?: number; vatRate?: number }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'invoice.create'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  // Resolve client (external) — snapshot the name so later edits don't mutate history.
  let clientName: string | null = body.clientName?.trim() || null;
  let clientExternalId: string | null = body.clientExternalId ? String(body.clientExternalId) : null;
  if (clientExternalId) {
    try {
      const [c] = await db.select().from(invoiceClients)
        .where(and(eq(invoiceClients.id, clientExternalId), eq(invoiceClients.ownerCompanyId, cid))).limit(1);
      if (!c) { clientExternalId = null; }
      else { clientName = clientName || c.name; }
    } catch { /* DB absent — keep provided values */ }
  }
  if (!clientName) return new Response(JSON.stringify({ error: 'Alege un client' }), { status: 400 });

  const rawLines: LineInput[] = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((l) => {
      const quantity = Number(l.quantity) || 0;
      const unitPriceCents = Math.max(0, Math.round(Number(l.unitPriceCents) || 0));
      const vatRate = l.vatRate != null ? Math.max(0, Number(l.vatRate)) : 21;
      const net = Math.round(quantity * unitPriceCents);
      const vat = Math.round(net * (vatRate / 100));
      return {
        productId: l.productId ? String(l.productId) : null,
        name: String(l.name || '').trim(),
        quantity,
        unitPriceCents,
        vatRate,
        lineTotalCents: net + vat,
      };
    })
    .filter((l) => l.name && l.quantity > 0);

  if (lines.length === 0) return new Response(JSON.stringify({ error: 'Adaugă cel puțin o linie validă' }), { status: 400 });

  const totalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const status = VALID_STATUS.includes(body.status) ? body.status : 'draft';
  const number = String(body.number || '').trim() || `CV-${Date.now().toString().slice(-8)}`;

  const orderId = nanoid();
  try {
    await db.insert(salesOrders).values({
      id: orderId,
      companyId: cid,
      number,
      clientExternalId,
      clientNameSnap: clientName,
      orderDate: body.orderDate || new Date().toISOString().slice(0, 10),
      currency: (body.currency || 'RON').toUpperCase().slice(0, 5),
      totalCents,
      status,
      notes: body.notes?.trim() || null,
      createdByUserId: locals.user.id,
    } as any);

    await db.insert(salesOrderLines).values(lines.map((l) => ({
      id: nanoid(),
      orderId,
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      vatRate: l.vatRate,
      lineTotalCents: l.lineTotalCents,
    })) as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvarea comenzii' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: orderId, number }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
