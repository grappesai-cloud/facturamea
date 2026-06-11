// POS sales (bonuri) — list + create.
//
// On create we compute subtotal/VAT/total from line vatRate, generate a
// per-company receipt number (BON-{seq}), insert posSales + posSaleLines,
// and decrement stock via applyStockOut when a warehouse is chosen and the
// line references a product.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { posSales, posSaleLines } from '../../../../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { applyStockOut } from '../../../../lib/stock';

const METHODS = ['cash', 'card', 'mixed'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db.select().from(posSales)
      .where(eq(posSales.companyId, cid))
      .orderBy(desc(posSales.createdAt))
      .limit(100);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((l) => {
      const quantity = Number(l.quantity) || 0;
      const unitPriceCents = Math.max(0, Math.round(Number(l.unitPriceCents) || 0));
      const vatRate = l.vatRate != null ? Number(l.vatRate) : 21;
      const gross = Math.round(quantity * unitPriceCents);
      // Prices are VAT-inclusive at POS; back out the net + VAT components.
      const net = vatRate > 0 ? Math.round(gross / (1 + vatRate / 100)) : gross;
      const vat = gross - net;
      return {
        productId: l.productId ? String(l.productId) : null,
        name: String(l.name || '').trim(),
        quantity,
        unitPriceCents,
        vatRate,
        netCents: net,
        vatCents: vat,
        lineTotalCents: gross,
      };
    })
    .filter((l) => l.name && l.quantity > 0);

  if (lines.length === 0) return new Response(JSON.stringify({ error: 'Coșul este gol' }), { status: 400 });

  const subtotalCents = lines.reduce((s, l) => s + l.netCents, 0);
  const vatCents = lines.reduce((s, l) => s + l.vatCents, 0);
  const totalCents = subtotalCents + vatCents;

  const paymentMethod = METHODS.includes(body.paymentMethod) ? body.paymentMethod : 'cash';
  const cashReceivedCents = Math.max(0, Math.round(Number(body.cashReceivedCents) || 0));
  const changeCents = paymentMethod === 'cash' && cashReceivedCents > totalCents
    ? cashReceivedCents - totalCents
    : 0;
  const warehouseId = body.warehouseId ? String(body.warehouseId) : null;

  const saleId = nanoid();
  let receiptNumber = `BON-${Date.now()}`;
  try {
    // Per-company sequential receipt number.
    const [cnt] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(posSales)
      .where(eq(posSales.companyId, cid));
    const seq = Number(cnt?.n ?? 0) + 1;
    receiptNumber = `BON-${String(seq).padStart(6, '0')}`;

    await db.insert(posSales).values({
      id: saleId,
      companyId: cid,
      warehouseId,
      receiptNumber,
      cashierUserId: locals.user.id,
      paymentMethod,
      subtotalCents,
      vatCents,
      totalCents,
      cashReceivedCents,
      changeCents,
    } as any);

    for (const l of lines) {
      await db.insert(posSaleLines).values({
        id: nanoid(),
        saleId,
        productId: l.productId,
        name: l.name,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        vatRate: l.vatRate,
        lineTotalCents: l.lineTotalCents,
      } as any);

      if (warehouseId && l.productId) {
        await applyStockOut(cid, warehouseId, l.productId, l.quantity, l.unitPriceCents, {
          reason: `Vânzare POS ${receiptNumber}`,
          refType: 'pos',
          refId: saleId,
          userId: locals.user.id,
        });
      }
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la finalizarea vânzării' }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ id: saleId, receiptNumber, subtotalCents, vatCents, totalCents, changeCents }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};
