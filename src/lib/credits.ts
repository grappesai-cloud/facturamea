import { db } from '../db';
import { creditBalances, creditTransactions, servicesCatalog } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Drizzle (node-postgres) exposes .transaction(); these helpers wrap
// balance + transaction insert in a single atomic block to avoid
// races when two requests for the same company arrive concurrently.

export async function getBalance(companyId: string): Promise<number> {
  const [row] = await db.select().from(creditBalances).where(eq(creditBalances.companyId, companyId));
  return row?.balance ?? 0;
}

export async function ensureBalance(companyId: string): Promise<void> {
  const [existing] = await db.select().from(creditBalances).where(eq(creditBalances.companyId, companyId));
  if (!existing) {
    await db.insert(creditBalances).values({ companyId, balance: 0, totalPurchased: 0, totalConsumed: 0 });
  }
}

export async function addCredits(params: {
  companyId: string;
  userId?: string;
  amountCrb: number;
  type: 'purchase' | 'bonus' | 'refund';
  reference?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ balance: number; transactionId: string }> {
  await ensureBalance(params.companyId);
  const txId = nanoid();
  const newBalance = await db.transaction(async (tx) => {
    // Lock the row for update so concurrent purchases serialise.
    const [row] = await tx.execute(
      sql`SELECT balance FROM credit_balances WHERE company_id = ${params.companyId} FOR UPDATE`,
    ) as any;
    const current = Number((row?.balance ?? row?.rows?.[0]?.balance ?? 0));
    const next = current + params.amountCrb;
    await tx.update(creditBalances).set({
      balance: next,
      totalPurchased: sql`${creditBalances.totalPurchased} + ${params.type === 'purchase' ? params.amountCrb : 0}`,
      updatedAt: new Date(),
    }).where(eq(creditBalances.companyId, params.companyId));
    await tx.insert(creditTransactions).values({
      id: txId,
      companyId: params.companyId,
      userId: params.userId,
      type: params.type,
      amountCrb: params.amountCrb,
      balanceAfter: next,
      reference: params.reference,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
    return next;
  });
  return { balance: newBalance, transactionId: txId };
}

export async function consumeCredits(params: {
  companyId: string;
  userId?: string;
  serviceCode: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; balance: number; transactionId: string; cost: number } | { ok: false; error: string; cost: number; balance: number }> {
  await ensureBalance(params.companyId);

  const [service] = await db.select().from(servicesCatalog).where(eq(servicesCatalog.code, params.serviceCode));
  if (!service || !service.isActive) {
    return { ok: false, error: 'Serviciu inexistent sau inactiv', cost: 0, balance: 0 };
  }

  const cost = Math.ceil(service.priceCrb);
  const txId = nanoid();
  try {
    const result = await db.transaction(async (tx) => {
      // SELECT … FOR UPDATE prevents two concurrent consume calls from
      // both reading the same balance and double-spending it.
      const lockRes: any = await tx.execute(
        sql`SELECT balance FROM credit_balances WHERE company_id = ${params.companyId} FOR UPDATE`,
      );
      const rows = lockRes.rows ?? lockRes;
      const currentBalance = Number(rows?.[0]?.balance ?? 0);
      if (currentBalance < cost) {
        return { ok: false as const, balance: currentBalance };
      }
      const newBalance = currentBalance - cost;
      await tx.update(creditBalances).set({
        balance: newBalance,
        totalConsumed: sql`${creditBalances.totalConsumed} + ${cost}`,
        updatedAt: new Date(),
      }).where(eq(creditBalances.companyId, params.companyId));
      await tx.insert(creditTransactions).values({
        id: txId,
        companyId: params.companyId,
        userId: params.userId,
        type: 'consume',
        serviceCode: params.serviceCode,
        amountCrb: -cost,
        balanceAfter: newBalance,
        reference: params.reference,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      });
      return { ok: true as const, balance: newBalance };
    });
    if (!result.ok) {
      return { ok: false, error: 'Credite insuficiente', cost, balance: result.balance };
    }
    return { ok: true, balance: result.balance, transactionId: txId, cost };
  } catch (err) {
    // CHECK constraint chk_credit_balance_nonneg violation lands here on race
    return { ok: false, error: 'Credite insuficiente', cost, balance: 0 };
  }
}

// Atomic debit of an explicit amount (not a catalog service). Used where the
// cost is computed dynamically — e.g. invoice-guarantee premium (3% of value).
// Same FOR UPDATE + balance guard as consumeCredits; never goes negative.
export async function debitCredits(params: {
  companyId: string;
  userId?: string;
  amountCrb: number; // positive amount to subtract
  reference?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: true; balance: number; transactionId: string } | { ok: false; error: string; balance: number }> {
  await ensureBalance(params.companyId);
  const cost = Math.max(Math.ceil(params.amountCrb), 0);
  const txId = nanoid();
  try {
    const result = await db.transaction(async (tx) => {
      const lockRes: any = await tx.execute(
        sql`SELECT balance FROM credit_balances WHERE company_id = ${params.companyId} FOR UPDATE`,
      );
      const rows = lockRes.rows ?? lockRes;
      const currentBalance = Number(rows?.[0]?.balance ?? 0);
      if (currentBalance < cost) return { ok: false as const, balance: currentBalance };
      const newBalance = currentBalance - cost;
      await tx.update(creditBalances).set({
        balance: newBalance,
        totalConsumed: sql`${creditBalances.totalConsumed} + ${cost}`,
        updatedAt: new Date(),
      }).where(eq(creditBalances.companyId, params.companyId));
      await tx.insert(creditTransactions).values({
        id: txId,
        companyId: params.companyId,
        userId: params.userId,
        type: 'consume',
        amountCrb: -cost,
        balanceAfter: newBalance,
        reference: params.reference,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      });
      return { ok: true as const, balance: newBalance };
    });
    if (!result.ok) return { ok: false, error: 'Credite insuficiente', balance: result.balance };
    return { ok: true, balance: result.balance, transactionId: txId };
  } catch {
    return { ok: false, error: 'Credite insuficiente', balance: 0 };
  }
}

export const DEFAULT_SERVICES_SEED = [
  { code: 'extra_user', nameRo: 'Utilizator extra (lunar)', nameEn: 'Extra user (monthly)', priceCrb: 33, priceLei: 165, category: 'extra_user', sortOrder: 1 },
  { code: 'premium_day', nameRo: 'Zi Premium', nameEn: 'Premium day', priceCrb: 10, priceLei: 50, category: 'premium_day', sortOrder: 2 },
  { code: 'consult_freight_alepsa', nameRo: 'Consultare marfă Alepsa < 3.5t', nameEn: 'Alepsa freight check < 3.5t', priceCrb: 1, priceLei: 5, category: 'consult', sortOrder: 3 },
  { code: 'incident_under_1000', nameRo: 'Declarare incident plată < 1000 lei', nameEn: 'Declare payment incident < 1000 RON', priceCrb: 4, priceLei: 20, category: 'incident_declare', sortOrder: 4 },
  { code: 'incident_over_1000', nameRo: 'Declarare incident plată > 1000 lei', nameEn: 'Declare payment incident > 1000 RON', priceCrb: 8, priceLei: 40, category: 'incident_declare', sortOrder: 5 },
  { code: 'featured_listing', nameRo: 'Anunț evidențiat (7 zile)', nameEn: 'Featured listing (7 days)', priceCrb: 15, priceLei: 75, category: 'featured_listing', sortOrder: 6 },
  { code: 'classified_post', nameRo: 'Mică publicitate (1 anunț)', nameEn: 'Classified ad (1 listing)', priceCrb: 5, priceLei: 25, category: 'classified', sortOrder: 7 },
  { code: 'company_report', nameRo: 'Raport financiar companie', nameEn: 'Company financial report', priceCrb: 8, priceLei: 40, category: 'company_report', sortOrder: 8 },
  { code: 'sms_freight_alert', nameRo: 'Notificare SMS marfă', nameEn: 'SMS freight alert', priceCrb: 1, priceLei: 5, category: 'sms_notif', sortOrder: 9 },
  { code: 'invoice_guarantee_premium', nameRo: 'Garanție factură (3% valoare)', nameEn: 'Invoice guarantee (3% value)', priceCrb: 0, priceLei: 0, category: 'guarantee', sortOrder: 10 },
];
