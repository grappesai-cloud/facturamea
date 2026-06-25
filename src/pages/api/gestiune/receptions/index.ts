// Receptions (NIR — Notă de Intrare Recepție): list + create.
//
// On create we insert the reception header + lines, then for each line that
// references a product we record an 'in' stock movement and upsert the
// stockLevels (weighted-average cost) via applyStockIn.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { receptions, receptionLines, suppliers, warehouses, invoiceProducts } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { applyStockIn } from '../../../../lib/stock';
import { requireRole } from '../../../../lib/require-role';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db
      .select({
        id: receptions.id,
        warehouseId: receptions.warehouseId,
        supplierId: receptions.supplierId,
        supplierName: suppliers.name,
        nirNumber: receptions.nirNumber,
        supplierInvoiceNumber: receptions.supplierInvoiceNumber,
        receptionDate: receptions.receptionDate,
        netCents: receptions.netCents,
        vatCents: receptions.vatCents,
        totalCents: receptions.totalCents,
        status: receptions.status,
        createdAt: receptions.createdAt,
      })
      .from(receptions)
      .leftJoin(suppliers, eq(receptions.supplierId, suppliers.id))
      .where(eq(receptions.companyId, cid))
      .orderBy(desc(receptions.createdAt))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'stock.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const warehouseId = String(body.warehouseId || '').trim();
  const nirNumber = String(body.nirNumber || '').trim();
  if (!warehouseId) return new Response(JSON.stringify({ error: 'Alege o gestiune' }), { status: 400 });
  if (!nirNumber) return new Response(JSON.stringify({ error: 'Numărul NIR e obligatoriu' }), { status: 400 });

  // Verify the warehouse belongs to the caller's company before any stock mutation.
  const [wh] = await db.select({ id: warehouses.id }).from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.companyId, cid))).limit(1);
  if (!wh) return new Response(JSON.stringify({ error: 'Gestiune inexistentă' }), { status: 400 });

  const rawLines: any[] = Array.isArray(body.lines) ? body.lines : [];
  const lines = rawLines
    .map((l) => {
      const quantity = Number(l.quantity) || 0;
      const unitCostCents = Math.max(0, Math.round(Number(l.unitCostCents) || 0));
      const vatRate = l.vatRate != null ? Number(l.vatRate) : 21;
      const net = Math.round(quantity * unitCostCents);
      const vat = Math.round(net * (vatRate / 100));
      return {
        productId: l.productId ? String(l.productId) : null,
        name: String(l.name || '').trim(),
        um: (l.um || 'buc').toString().slice(0, 16),
        quantity,
        unitCostCents,
        vatRate,
        netCents: net,
        vatCents: vat,
        lineTotalCents: net + vat,
      };
    })
    .filter((l) => l.name && l.quantity > 0);

  if (lines.length === 0) return new Response(JSON.stringify({ error: 'Adaugă cel puțin o linie validă' }), { status: 400 });

  const netCents = lines.reduce((s, l) => s + l.netCents, 0);
  const vatCents = lines.reduce((s, l) => s + l.vatCents, 0);
  const totalCents = netCents + vatCents;
  const status = body.status === 'draft' ? 'draft' : 'posted';

  const receptionId = nanoid();
  try {
    // Atomic: NIR header + lines + stock-in in one transaction, so a partial
    // reception can't leave wrong stock levels / weighted-avg cost on failure.
    await db.transaction(async (tx) => {
      await tx.insert(receptions).values({
        id: receptionId,
        companyId: cid,
        warehouseId,
        supplierId: body.supplierId ? String(body.supplierId) : null,
        nirNumber,
        supplierInvoiceNumber: body.supplierInvoiceNumber?.trim() || null,
        receptionDate: body.receptionDate || new Date().toISOString().slice(0, 10),
        netCents,
        vatCents,
        totalCents,
        status,
        notes: body.notes?.trim() || null,
        createdByUserId: locals.user!.id,
      } as any);

      for (const l of lines) {
        // Stock is tracked per catalogue product (stock_levels → invoice_products).
        // A free-text line (name only, no productId) would otherwise post value
        // without ever building stock. Auto-create a catalogue product so the
        // reception actually lands on stock, matching the success message.
        let productId = l.productId ? String(l.productId) : null;
        if (!productId && l.name && status === 'posted') {
          productId = nanoid();
          await tx.insert(invoiceProducts).values({
            id: productId, companyId: cid, name: String(l.name).slice(0, 300),
            defaultUm: l.um || 'buc', defaultUnitPriceCents: l.unitCostCents ?? 0,
            productType: 'Marfuri',
          } as any);
        }

        await tx.insert(receptionLines).values({
          id: nanoid(),
          receptionId,
          productId,
          name: l.name,
          um: l.um,
          quantity: l.quantity,
          unitCostCents: l.unitCostCents,
          vatRate: l.vatRate,
          lineTotalCents: l.lineTotalCents,
        } as any);

        // Post to stock when the reception is posted and we have a product.
        if (status === 'posted' && productId) {
          await applyStockIn(cid, warehouseId, productId, l.quantity, l.unitCostCents, {
            reason: `NIR ${nirNumber}`,
            refType: 'nir',
            refId: receptionId,
            userId: locals.user!.id,
          }, tx);
        }
      }
    });
  } catch (err) {
    console.error('[receptions] save failed:', err instanceof Error ? `${err.name}: ${err.message}` : err);
    return new Response(JSON.stringify({ error: 'Eroare la salvarea recepției' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: receptionId }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
