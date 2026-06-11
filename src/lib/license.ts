import { db } from '../db';
import { appLicenses } from '../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const TRIAL_DAYS = 14;
export const LIFETIME_PRICE_CENTS = 70000; // 700 RON
export const LIFETIME_CURRENCY = 'RON';

export type LicenseState = {
  plan: 'trial' | 'lifetime';
  status: string;
  active: boolean;
  trialEndsAt: Date | null;
  trialDaysLeft: number;
};

// Fetch (and lazily create a 14-day trial for) a company's license.
export async function getOrCreateLicense(companyId: string) {
  const [existing] = await db.select().from(appLicenses).where(eq(appLicenses.companyId, companyId));
  if (existing) return existing;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const row = {
    id: nanoid(),
    companyId,
    plan: 'trial' as const,
    status: 'active' as const,
    trialEndsAt,
  };
  try {
    await db.insert(appLicenses).values(row as any);
  } catch {
    // Race: another request created it — re-read.
    const [again] = await db.select().from(appLicenses).where(eq(appLicenses.companyId, companyId));
    if (again) return again;
  }
  return row as any;
}

export function computeState(license: any): LicenseState {
  const plan = (license?.plan as 'trial' | 'lifetime') || 'trial';
  const status = license?.status || 'active';
  const trialEndsAt = license?.trialEndsAt ? new Date(license.trialEndsAt) : null;
  let active = false;
  let trialDaysLeft = 0;
  if (status === 'active') {
    if (plan === 'lifetime') active = true;
    else if (trialEndsAt) {
      const ms = trialEndsAt.getTime() - Date.now();
      trialDaysLeft = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
      active = ms > 0;
    }
  }
  return { plan, status, active, trialEndsAt, trialDaysLeft };
}

// Convenience: full state for a company (creates trial if missing).
export async function licenseState(companyId: string): Promise<LicenseState> {
  const lic = await getOrCreateLicense(companyId);
  return computeState(lic);
}

// Grant a lifetime license (Stripe webhook or admin panel).
export async function grantLifetime(companyId: string, opts: {
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  amountCents?: number;
  grantedByAdminId?: string;
} = {}) {
  const existing = await getOrCreateLicense(companyId);
  await db
    .update(appLicenses)
    .set({
      plan: 'lifetime',
      status: 'active',
      activatedAt: new Date(),
      amountCents: opts.amountCents ?? LIFETIME_PRICE_CENTS,
      currency: LIFETIME_CURRENCY,
      stripeSessionId: opts.stripeSessionId ?? null,
      stripePaymentIntentId: opts.stripePaymentIntentId ?? null,
      grantedByAdminId: opts.grantedByAdminId ?? null,
      updatedAt: new Date(),
    } as any)
    .where(eq(appLicenses.companyId, companyId));
  return { ...existing, plan: 'lifetime', status: 'active' };
}
