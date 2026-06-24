// POS sales (bonuri) — list + create.
//
// On create we compute subtotal/VAT/total from line vatRate, generate a
// per-company receipt number (BON-{seq}), insert posSales + posSaleLines,
// and decrement stock via applyStockOut when a warehouse is chosen and the
// line references a product.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { posSales, posSaleLines, warehouses } from '../../../../db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { applyStockOut } from '../../../../lib/stock';
import { requireRole } from '../../../../lib/require-role';

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
  const denied = requireRole(locals, 'pos.use');
  if (denied) return denied;
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
  const warehouseId = body.warehouseId ? String(body.warehouseId).trim() : null;

  // If a warehouse is chosen, verify it belongs to the caller's company
  // before any stock mutation (prevents cross-tenant stock corruption).
  if (warehouseId) {
    const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, cid))).limit(1);
    if (!wh) return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 400 });
  }

  const saleId = nanoid();
  let receiptNumber = `BON-${Date.now()}`;
  const MAX_RECEIPT_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_RECEIPT_ATTEMPTS; attempt++) {
   try {
    // Per-company sequential receipt number from the current MAX suffix (+ attempt)
    // so a concurrent collision on uq_pos_sales_receipt retries instead of 500'ing.
    const [maxRow] = await db
      .select({ m: sql<number>`COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(${posSales.receiptNumber}, '\\D', '', 'g'), '') AS INTEGER)), 0)` })
      .from(posSales)
      .where(eq(posSales.companyId, cid));
    const seq = Number(maxRow?.m ?? 0) + 1 + attempt;
    receiptNumber = `BON-${String(seq).padStart(6, '0')}`;

    // Atomic: sale header + lines + stock decrements in one transaction, so a
    // mid-loop failure can't leave a sale with partial lines / partial stock.
    await db.transaction(async (tx) => {
      await tx.insert(posSales).values({
        id: saleId,
        companyId: cid,
        warehouseId,
        receiptNumber,
        cashierUserId: locals.user!.id,
        paymentMethod,
        subtotalCents,
        vatCents,
        totalCents,
        cashReceivedCents,
        changeCents,
      } as any);

      for (const l of lines) {
        await tx.insert(posSaleLines).values({
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
          await applyStockOut(cid, warehouseId, l.productId, l.quantity, null, {
            reason: `Vânzare POS ${receiptNumber}`,
            refType: 'pos',
            refId: saleId,
            userId: locals.user!.id,
          }, tx);
        }
      }
    });
    break; // success
   } catch (e: any) {
     if (e?.code === '23505' && attempt < MAX_RECEIPT_ATTEMPTS - 1) continue; // receipt collision → retry
     return new Response(JSON.stringify({ error: 'Eroare la finalizarea vânzării' }), { status: 500 });
   }
  }

  return new Response(
    JSON.stringify({ id: saleId, receiptNumber, subtotalCents, vatCents, totalCents, changeCents }),
    { status: 201, headers: { 'Content-Type': 'application/json' } }
  );
};
