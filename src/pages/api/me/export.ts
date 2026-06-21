import type { APIRoute } from 'astro';
import { db } from '../../../db';
import {
  users, companies, transportInvoices, transportInvoiceLines,
  transportInvoicePayments, invoiceClients, invoiceProducts,
  expenses, suppliers, creditTransactions, notifications,
  companyDocuments, appLicenses, auditLog,
} from '../../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';
import { verifyPassword } from '../../../lib/auth';
import { rateLimitAsync } from '../../../lib/security';

// GDPR Article 20 — right to data portability. Exports the user's invoicing
// data as a JSON document. Requires the current password in the body — guards
// against a stolen session auto-exfiltrating everything in one click.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  // Rate-limit: max 3 exports per user per hour
  const rl = await rateLimitAsync(`gdpr-export:${locals.user.id}`, 3, 60 * 60 * 1000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: `Prea multe export-uri. Aşteaptă ${Math.ceil(rl.resetIn / 60_000)} minute.`,
    }), { status: 429 });
  }

  // Re-authenticate via password to prevent stolen-session exfiltration
  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  if (!body.password || typeof body.password !== 'string') {
    return new Response(JSON.stringify({
      error: 'Parola este obligatorie pentru export. POST { "password": "..." }',
    }), { status: 400 });
  }
  const [u] = await db.select({ hashedPassword: users.hashedPassword })
    .from(users).where(eq(users.id, locals.user.id));
  if (!u || !(await verifyPassword(body.password, u.hashedPassword))) {
    return new Response(JSON.stringify({ error: 'Parolă incorectă' }), { status: 401 });
  }

  const userId = locals.user.id;
  const companyId = locals.user.companyId;

  async function safe<T>(p: Promise<T>): Promise<T | null> {
    try { return await p; } catch { return null; }
  }
  const noCompany = Promise.resolve(null);
  const invoiceIds = companyId
    ? db.select({ id: transportInvoices.id }).from(transportInvoices).where(eq(transportInvoices.companyId, companyId))
    : null;

  const [
    me, company, myInvoices, myInvoiceLines, myPayments,
    myClients, myProducts, myExpenses, mySuppliers,
    myCredits, myNotifications, myDocs, myLicenses, myAudit,
  ] = await Promise.all([
    safe(db.select().from(users).where(eq(users.id, userId))),
    safe(companyId ? db.select().from(companies).where(eq(companies.id, companyId)) : noCompany),
    safe(companyId ? db.select().from(transportInvoices).where(eq(transportInvoices.companyId, companyId)) : noCompany),
    safe(invoiceIds ? db.select().from(transportInvoiceLines).where(inArray(transportInvoiceLines.invoiceId, invoiceIds)) : noCompany),
    safe(invoiceIds ? db.select().from(transportInvoicePayments).where(inArray(transportInvoicePayments.invoiceId, invoiceIds)) : noCompany),
    safe(companyId ? db.select().from(invoiceClients).where(eq(invoiceClients.ownerCompanyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(invoiceProducts).where(eq(invoiceProducts.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(expenses).where(eq(expenses.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(suppliers).where(eq(suppliers.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(creditTransactions).where(eq(creditTransactions.companyId, companyId)) : noCompany),
    safe(db.select().from(notifications).where(eq(notifications.userId, userId))),
    safe(companyId ? db.select().from(companyDocuments).where(eq(companyDocuments.companyId, companyId)) : noCompany),
    safe(companyId ? db.select().from(appLicenses).where(eq(appLicenses.companyId, companyId)) : noCompany),
    safe(db.select().from(auditLog).where(eq(auditLog.userId, userId))),
  ]);

  // Strip security artifacts before exporting.
  const sanitizedMe = me?.[0]
    ? { ...me[0], hashedPassword: '[redacted]', totpSecret: '[redacted]', totpRecoveryCodes: '[redacted]' }
    : null;

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: '2.0',
    subject: { userId, email: locals.user.email, name: locals.user.name },
    data: {
      account: sanitizedMe,
      company: company?.[0] || null,
      invoices: myInvoices,
      invoiceLines: myInvoiceLines,
      payments: myPayments,
      clients: myClients,
      products: myProducts,
      expenses: myExpenses,
      suppliers: mySuppliers,
      creditTransactions: myCredits,
      notifications: myNotifications,
      companyDocuments: myDocs,
      licenses: myLicenses,
      auditLog: myAudit,
    },
  };

  await logAction({
    userId, companyId, action: 'gdpr.export',
    entityType: 'user', entityId: userId, request,
  });

  const filename = `facturamea-data-${userId}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
