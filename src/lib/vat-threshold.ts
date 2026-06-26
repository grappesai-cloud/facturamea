// Auto-detect when a non-VAT-payer company crosses the Romanian VAT
// registration threshold (plafonul de înregistrare în scopuri de TVA) and
// notify the owner. We deliberately do NOT auto-flip `isVatPayer`: a company
// may only charge VAT after it is actually registered with ANAF, so flipping
// the flag automatically would make it issue VAT invoices illegally. Instead
// we surface a one-time notification telling the owner to register, after
// which they switch the setting themselves.
import { db } from '../db';
import { companies, transportInvoices, notifications, userCompanyMemberships } from '../db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { notify } from './notifications';

// 300.000 lei, stored in cents to match transportInvoices.totalCents.
const VAT_THRESHOLD_CENTS = 300_000 * 100;

export async function checkVatThreshold(companyId: string): Promise<void> {
  const [co] = await db.select({ isVatPayer: companies.isVatPayer })
    .from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!co || co.isVatPayer) return; // already a VAT payer (or missing) → nothing to do

  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);

  // YTD turnover = sum of issued RON invoices this calendar year (drafts and
  // reversed/storno excluded). Foreign-currency invoices are ignored here; the
  // plafon is a lei figure and would need FX conversion to mix currencies.
  const [agg] = await db.select({
    total: sql<number>`COALESCE(SUM(${transportInvoices.totalCents}), 0)`,
  }).from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId),
    eq(transportInvoices.kind, 'factura'),
    eq(transportInvoices.currency, 'RON'),
    gte(transportInvoices.issuedAt, yearStart),
    sql`${transportInvoices.status} NOT IN ('draft','voided','reversed','storno','canceled')`,
  ));
  if (Number(agg?.total ?? 0) < VAT_THRESHOLD_CENTS) return;

  // Notify the owner — once per calendar year (don't spam on every invoice).
  const [owner] = await db.select({ userId: userCompanyMemberships.userId })
    .from(userCompanyMemberships)
    .where(and(eq(userCompanyMemberships.companyId, companyId), eq(userCompanyMemberships.role, 'owner')))
    .limit(1);
  if (!owner?.userId) return;

  const [already] = await db.select({ id: notifications.id }).from(notifications).where(and(
    eq(notifications.userId, owner.userId),
    eq(notifications.type, 'vat_threshold'),
    gte(notifications.createdAt, yearStart),
  )).limit(1);
  if (already) return;

  await notify({
    userId: owner.userId,
    type: 'vat_threshold',
    title: 'Ai depășit plafonul de TVA (300.000 lei)',
    body: `Cifra ta de afaceri din ${year} a depășit plafonul de 300.000 lei. Conform legii trebuie să te înregistrezi în scopuri de TVA la ANAF în 10 zile de la depășire. După înregistrare, comută firma pe „plătitor de TVA" din Setări, ca facturile noi să includă automat TVA.`,
    linkUrl: '/app/setari',
    email: true,
  });
}
