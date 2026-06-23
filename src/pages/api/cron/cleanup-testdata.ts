// TEMP — wipe ALL test operational data for the solaastech company created during
// the audit test pass, KEEPING the real validated invoice SOL 0104. CRON_SECRET. DELETE after.
import type { APIRoute } from 'astro';
import {
  db, transportInvoices, transportInvoiceLines, transportInvoicePayments,
  expenses, suppliers, warehouses, stockLevels, stockMovements,
  receptions, receptionLines, posSales, posSaleLines, stockCounts, stockCountLines,
  invoiceClients, invoiceProducts, purchaseOrders, purchaseOrderLines, salesOrders, salesOrderLines, users,
} from '../../../db';
import { and, eq, ne, inArray } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.email, 'solaastech@gmail.com')).limit(1);
  if (!u?.companyId) return new Response(JSON.stringify({ error: 'cont inexistent' }), { status: 404 });
  const c = u.companyId;
  const log: Record<string, number> = {};
  const del = async (label: string, fn: () => Promise<any>) => { try { const r = await fn(); log[label] = (r as any)?.rowCount ?? 1; } catch (e) { log[label] = -1; } };

  // Invoices: keep SOL 0104 (real). Delete the rest + their lines/payments.
  const testInv = await db.select({ id: transportInvoices.id }).from(transportInvoices)
    .where(and(eq(transportInvoices.companyId, c), ne(transportInvoices.fullNumber, 'SOL 0104')));
  const ids = testInv.map(r => r.id);
  if (ids.length) {
    await del('invoiceParentUnlink', () => db.update(transportInvoices).set({ parentInvoiceId: null } as any).where(inArray(transportInvoices.parentInvoiceId, ids)));
    await del('invoicePayments', () => db.delete(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, ids)));
    await del('invoiceLines', () => db.delete(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, ids)));
    await del('invoices', () => db.delete(transportInvoices).where(inArray(transportInvoices.id, ids)));
  }

  // Operational test data — all of it is test (the user had none before).
  const recIds = (await db.select({ id: receptions.id }).from(receptions).where(eq(receptions.companyId, c))).map(r => r.id);
  if (recIds.length) await del('receptionLines', () => db.delete(receptionLines).where(inArray(receptionLines.receptionId, recIds)));
  await del('receptions', () => db.delete(receptions).where(eq(receptions.companyId, c)));
  const posIds = (await db.select({ id: posSales.id }).from(posSales).where(eq(posSales.companyId, c))).map(r => r.id);
  if (posIds.length) await del('posSaleLines', () => db.delete(posSaleLines).where(inArray(posSaleLines.saleId, posIds)));
  await del('posSales', () => db.delete(posSales).where(eq(posSales.companyId, c)));
  const cntIds = (await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.companyId, c))).map(r => r.id);
  if (cntIds.length) await del('stockCountLines', () => db.delete(stockCountLines).where(inArray(stockCountLines.countId, cntIds)));
  await del('stockCounts', () => db.delete(stockCounts).where(eq(stockCounts.companyId, c)));
  await del('stockMovements', () => db.delete(stockMovements).where(eq(stockMovements.companyId, c)));
  await del('stockLevels', () => db.delete(stockLevels).where(eq(stockLevels.companyId, c)));
  const poIds = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.companyId, c))).map(r => r.id);
  if (poIds.length) await del('poLines', () => db.delete(purchaseOrderLines).where(inArray(purchaseOrderLines.orderId, poIds)));
  await del('purchaseOrders', () => db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, c)));
  const soIds = (await db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.companyId, c))).map(r => r.id);
  if (soIds.length) await del('soLines', () => db.delete(salesOrderLines).where(inArray(salesOrderLines.orderId, soIds)));
  await del('salesOrders', () => db.delete(salesOrders).where(eq(salesOrders.companyId, c)));
  await del('warehouses', () => db.delete(warehouses).where(eq(warehouses.companyId, c)));
  await del('expenses', () => db.delete(expenses).where(eq(expenses.companyId, c)));
  await del('suppliers', () => db.delete(suppliers).where(eq(suppliers.companyId, c)));
  await del('invoiceProducts', () => db.delete(invoiceProducts).where(eq(invoiceProducts.companyId, c)));
  await del('invoiceClients', () => db.delete(invoiceClients).where(eq(invoiceClients.ownerCompanyId, c)));

  return new Response(JSON.stringify({ ok: true, kept: 'SOL 0104', deleted: log }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
