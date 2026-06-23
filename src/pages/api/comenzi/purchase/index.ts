// Purchase orders (comenzi furnizori) — list + create.
//
// A purchase order is a request to a supplier. Lines hold qty + unit price in
// cents + vat rate. Totals are computed server-side. Receiving the goods is a
// separate PATCH action='receive' on [id].ts that posts stock IN.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { purchaseOrders, purchaseOrderLines, suppliers } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

const VALID_STATUS = ['draft', 'sent', 'received', 'closed', 'canceled'];

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const status = url.searchParams.get('status')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(purchaseOrders.companyId, cid)];
    if (status && VALID_STATUS.includes(status)) conds.push(eq(purchaseOrders.status, status));
    results = await db
      .select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        supplierId: purchaseOrders.supplierId,
        supplierName: suppliers.name,
        supplierNameSnap: purchaseOrders.supplierNameSnap,
        orderDate: purchaseOrders.orderDate,
        expectedDate: purchaseOrders.expectedDate,
        currency: purchaseOrders.currency,
        totalCents: purchaseOrders.totalCents,
        status: purchaseOrders.status,
        createdAt: purchaseOrders.createdAt,
      })
      .from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .where(and(...conds))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

interface LineInput { productId?: string | null; name?: string; quantity?: number; unitPriceCents?: number; vatRate?: number }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'stock.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let supplierName: string | null = body.supplierName?.trim() || null;
  let supplierId: string | null = body.supplierId ? String(body.supplierId) : null;
  if (supplierId) {
    try {
      const [s] = await db.select().from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.companyId, cid))).limit(1);
      if (!s) { supplierId = null; }
      else { supplierName = supplierName || s.name; }
    } catch { /* DB absent — keep provided values */ }
  }
  if (!supplierName) return new Response(JSON.stringify({ error: 'Alege un furnizor' }), { status: 400 });

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
  const number = String(body.number || '').trim() || `CF-${Date.now().toString().slice(-8)}`;

  const orderId = nanoid();
  try {
    await db.insert(purchaseOrders).values({
      id: orderId,
      companyId: cid,
      number,
      supplierId,
      supplierNameSnap: supplierName,
      orderDate: body.orderDate || new Date().toISOString().slice(0, 10),
      expectedDate: body.expectedDate || null,
      currency: (body.currency || 'RON').toUpperCase().slice(0, 5),
      totalCents,
      status,
      notes: body.notes?.trim() || null,
      createdByUserId: locals.user.id,
    } as any);

    await db.insert(purchaseOrderLines).values(lines.map((l) => ({
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
