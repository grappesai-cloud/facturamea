// TEMPORARY endpoint — grants a free lifetime license to a test account and
// seeds the SOLAAS TECH fiscal profile so the onboarding gate passes, leaving
// the account ready to connect ANAF with a qualified certificate.
//
// Guarded by CRON_SECRET (Bearer). DELETE this file after use.
import type { APIRoute } from 'astro';
import { db, users, companies, billingAddresses } from '../../../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword } from '../../../lib/auth';
import { generatePlatformId } from '../../../lib/platform-id';
import { grantLifetime } from '../../../lib/license';
import { isCronAuthorized } from '../../../lib/cron-auth';

const EMAIL = 'solaastech@gmail.com';
const TEMP_PASSWORD = 'Solaas-Test-2026!';

// SOLAAS TECH S.R.L. — real operator firm (Constanța).
const FIRM = {
  name: 'SOLAAS TECH S.R.L.',
  cui: '54888013',
  regCom: 'J2026038411001',
  address: 'Str. Prieteniei nr. 7, bl. P, sc. B, et. 2, ap. 26, Constanța, jud. Constanța',
  city: 'Constanța',
  country: 'Romania',
};

export const POST: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const out: Record<string, unknown> = { email: EMAIL };

  try {
    // 1) Find or create the user (+ its company).
    let [user] = await db.select().from(users).where(eq(users.email, EMAIL));
    let companyId: string;

    if (user) {
      companyId = user.companyId as string;
      out.userExisted = true;
      // Make sure the account can log in: verified + active + known password.
      await db.update(users).set({
        emailVerified: true,
        isActive: true,
        deletedAt: null,
        hashedPassword: await hashPassword(TEMP_PASSWORD),
      } as any).where(eq(users.id, user.id));
    } else {
      out.userExisted = false;
      companyId = nanoid();
      await db.insert(companies).values({
        id: companyId,
        name: FIRM.name,
        cui: FIRM.cui,
        country: FIRM.country,
        city: FIRM.city,
        address: FIRM.address,
        subscriptionTier: 'free',
      } as any);

      const userId = nanoid();
      const platformId = await generatePlatformId();
      const referralCode = platformId.replace(/^FM/i, '').toUpperCase();
      await db.insert(users).values({
        id: userId,
        platformId,
        email: EMAIL,
        emailVerified: true,
        isActive: true,
        hashedPassword: await hashPassword(TEMP_PASSWORD),
        name: 'SOLAAS TECH',
        userType: 'intermediar',
        companyId,
        referralCode,
      } as any);
      user = { id: userId } as any;
    }
    out.companyId = companyId;

    // 2) Seed / complete the fiscal profile so the onboarding gate passes
    //    (gate requires company.cui && company.address).
    await db.update(companies).set({
      name: FIRM.name,
      cui: FIRM.cui,
      address: FIRM.address,
      city: FIRM.city,
      country: FIRM.country,
    } as any).where(eq(companies.id, companyId));

    // 3) Default invoice issuer profile (best-effort).
    try {
      const [existing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
      const values = {
        legalName: FIRM.name,
        cui: FIRM.cui,
        regCom: FIRM.regCom,
        address: FIRM.address,
        city: FIRM.city,
        countryCode: 'RO',
        isDefault: true,
      };
      if (existing) {
        await db.update(billingAddresses).set(values as any).where(eq(billingAddresses.id, existing.id));
      } else {
        await db.insert(billingAddresses).values({ id: nanoid(), companyId, ...values } as any);
      }
    } catch (e) { out.billingProfile = 'skipped: ' + String((e as Error).message); }

    // 4) Grant the free lifetime license.
    await grantLifetime(companyId, { amountCents: 0 });
    out.license = 'lifetime/active (free)';
    out.tempPassword = TEMP_PASSWORD;
    out.ok = true;

    return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    out.ok = false;
    out.error = String((err as Error)?.message || err);
    return new Response(JSON.stringify(out, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
