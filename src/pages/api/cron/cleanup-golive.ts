// TEMP — go-live cleanup: wipe all test data from the REAL solaastech account
// (keeping the validated SOL 0104) and delete the throwaway test accounts
// (test.tva + test.contabil) entirely. CRON_SECRET. DELETE after.
import type { APIRoute } from 'astro';
import {
  db, users, companies, appLicenses, userCompanyMemberships,
  sessions, passwordResetTokens, emailVerificationTokens,
  transportInvoices, transportInvoiceLines, transportInvoicePayments,
  bankAccounts, bankTransactions, expenses, suppliers,
  warehouses, stockLevels, stockMovements, receptions, receptionLines,
  posSales, posSaleLines, stockCounts, stockCountLines, stockLots,
  journalEntries, journalLines, ledgerAccounts,
  invoiceClients, invoiceProducts, invoiceSeries, invoiceReminders,
  purchaseOrders, purchaseOrderLines, salesOrders, salesOrderLines,
} from '../../../db';
import { and, eq, ne, inArray } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const log: Record<string, number> = {};
  const del = async (label: string, fn: () => Promise<any>) => { try { const r = await fn(); log[label] = (r as any)?.rowCount ?? 1; } catch { log[label] = -1; } };

  // Resolve companies.
  const [sol] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.email, 'solaastech@gmail.com')).limit(1);
  const solCo = sol?.companyId as string | undefined;
  const testUsers = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(inArray(users.email, ['test.tva@facturamea.test', 'test.contabil@facturamea.test']));
  const testCo = testUsers.find((u) => u.companyId)?.companyId as string | undefined;

  // ── Helper: wipe ALL operational rows for a company id. ──
  async function wipeOperational(c: string, prefix: string, keepInvoiceNumber?: string) {
    const invConds = keepInvoiceNumber
      ? and(eq(transportInvoices.companyId, c), ne(transportInvoices.fullNumber, keepInvoiceNumber))
      : eq(transportInvoices.companyId, c);
    const invIds = (await db.select({ id: transportInvoices.id }).from(transportInvoices).where(invConds)).map((r) => r.id);
    if (invIds.length) {
      await del(`${prefix}.invParentUnlink`, () => db.update(transportInvoices).set({ parentInvoiceId: null } as any).where(inArray(transportInvoices.parentInvoiceId, invIds)));
      await del(`${prefix}.invPayments`, () => db.delete(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, invIds)));
      await del(`${prefix}.invLines`, () => db.delete(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, invIds)));
      await del(`${prefix}.invoices`, () => db.delete(transportInvoices).where(inArray(transportInvoices.id, invIds)));
    }
    // Accounting notes (regenerable). Keep the chart (ledgerAccounts).
    const jeIds = (await db.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.companyId, c))).map((r) => r.id);
    if (jeIds.length) await del(`${prefix}.journalLines`, () => db.delete(journalLines).where(inArray(journalLines.entryId, jeIds)));
    await del(`${prefix}.journalEntries`, () => db.delete(journalEntries).where(eq(journalEntries.companyId, c)));
    // Bank
    await del(`${prefix}.bankTx`, () => db.delete(bankTransactions).where(eq(bankTransactions.companyId, c)));
    await del(`${prefix}.bankAccounts`, () => db.delete(bankAccounts).where(eq(bankAccounts.companyId, c)));
    // Gestiune
    const recIds = (await db.select({ id: receptions.id }).from(receptions).where(eq(receptions.companyId, c))).map((r) => r.id);
    if (recIds.length) await del(`${prefix}.recLines`, () => db.delete(receptionLines).where(inArray(receptionLines.receptionId, recIds)));
    await del(`${prefix}.receptions`, () => db.delete(receptions).where(eq(receptions.companyId, c)));
    const posIds = (await db.select({ id: posSales.id }).from(posSales).where(eq(posSales.companyId, c))).map((r) => r.id);
    if (posIds.length) await del(`${prefix}.posLines`, () => db.delete(posSaleLines).where(inArray(posSaleLines.saleId, posIds)));
    await del(`${prefix}.posSales`, () => db.delete(posSales).where(eq(posSales.companyId, c)));
    const cntIds = (await db.select({ id: stockCounts.id }).from(stockCounts).where(eq(stockCounts.companyId, c))).map((r) => r.id);
    if (cntIds.length) await del(`${prefix}.countLines`, () => db.delete(stockCountLines).where(inArray(stockCountLines.countId, cntIds)));
    await del(`${prefix}.stockCounts`, () => db.delete(stockCounts).where(eq(stockCounts.companyId, c)));
    await del(`${prefix}.stockLots`, () => db.delete(stockLots).where(eq(stockLots.companyId, c)));
    await del(`${prefix}.stockMovements`, () => db.delete(stockMovements).where(eq(stockMovements.companyId, c)));
    await del(`${prefix}.stockLevels`, () => db.delete(stockLevels).where(eq(stockLevels.companyId, c)));
    await del(`${prefix}.warehouses`, () => db.delete(warehouses).where(eq(warehouses.companyId, c)));
    // Orders
    const poIds = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.companyId, c))).map((r) => r.id);
    if (poIds.length) await del(`${prefix}.poLines`, () => db.delete(purchaseOrderLines).where(inArray(purchaseOrderLines.orderId, poIds)));
    await del(`${prefix}.purchaseOrders`, () => db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, c)));
    const soIds = (await db.select({ id: salesOrders.id }).from(salesOrders).where(eq(salesOrders.companyId, c))).map((r) => r.id);
    if (soIds.length) await del(`${prefix}.soLines`, () => db.delete(salesOrderLines).where(inArray(salesOrderLines.orderId, soIds)));
    await del(`${prefix}.salesOrders`, () => db.delete(salesOrders).where(eq(salesOrders.companyId, c)));
    // Expenses + catalogue
    await del(`${prefix}.expenses`, () => db.delete(expenses).where(eq(expenses.companyId, c)));
    await del(`${prefix}.suppliers`, () => db.delete(suppliers).where(eq(suppliers.companyId, c)));
    await del(`${prefix}.invoiceProducts`, () => db.delete(invoiceProducts).where(eq(invoiceProducts.companyId, c)));
    await del(`${prefix}.invoiceClients`, () => db.delete(invoiceClients).where(eq(invoiceClients.ownerCompanyId, c)));
    await del(`${prefix}.reminders`, () => db.delete(invoiceReminders).where(eq(invoiceReminders.companyId, c)));
  }

  // 1) Clean the REAL account — keep SOL 0104.
  if (solCo) await wipeOperational(solCo, 'sol', 'SOL 0104');

  // 2) Delete the throwaway test company entirely (incl. series, chart, users).
  if (testCo) {
    await wipeOperational(testCo, 'test');
    await del('test.series', () => db.delete(invoiceSeries).where(eq(invoiceSeries.companyId, testCo)));
    await del('test.ledger', () => db.delete(ledgerAccounts).where(eq(ledgerAccounts.companyId, testCo)));
    await del('test.memberships', () => db.delete(userCompanyMemberships).where(eq(userCompanyMemberships.companyId, testCo)));
    await del('test.licenses', () => db.delete(appLicenses).where(eq(appLicenses.companyId, testCo)));
    await del('test.company', () => db.delete(companies).where(eq(companies.id, testCo)));
  }

  // Delete the test users themselves — independent of testCo (on a re-run the
  // company is already gone). Clear auth rows (no cascade) + memberships first.
  const tIds = testUsers.map((u) => u.id);
  if (tIds.length) {
    await del('test.memberships', () => db.delete(userCompanyMemberships).where(inArray(userCompanyMemberships.userId, tIds)));
    await del('test.sessions', () => db.delete(sessions).where(inArray(sessions.userId, tIds)));
    await del('test.resetTokens', () => db.delete(passwordResetTokens).where(inArray(passwordResetTokens.userId, tIds)));
    await del('test.verifyTokens', () => db.delete(emailVerificationTokens).where(inArray(emailVerificationTokens.userId, tIds)));
    await del('test.unparent', () => db.update(users).set({ parentUserId: null } as any).where(inArray(users.id, tIds)));
    await del('test.usersDel', () => db.delete(users).where(inArray(users.id, tIds)));
  }

  return new Response(JSON.stringify({ ok: true, solCo, testCo, deleted: log }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
