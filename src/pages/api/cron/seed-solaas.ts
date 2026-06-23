// TEMPORARY endpoint — grants a FREE lifetime license to a single test account
// so it skips the paywall. It does NOT seed any fiscal identity: the user fills
// their own company data (CUI matching their ANAF certificate) via onboarding.
//
// Guarded by CRON_SECRET (Bearer). DELETE this file after use.
import type { APIRoute } from 'astro';
import { db, users, companies } from '../../../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword } from '../../../lib/auth';
import { generatePlatformId } from '../../../lib/platform-id';
import { grantLifetime } from '../../../lib/license';
import { isCronAuthorized } from '../../../lib/cron-auth';

const EMAIL = 'solaastech@gmail.com';
const TEMP_PASSWORD = 'Solaas-Test-2026!';

export const POST: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const out: Record<string, unknown> = { email: EMAIL };

  try {
    let [user] = await db.select().from(users).where(eq(users.email, EMAIL));
    let companyId: string;

    if (user) {
      companyId = user.companyId as string;
      out.userExisted = true;
      // Ensure the account can log in (verified + active). Password left as-is.
      await db.update(users).set({
        emailVerified: true,
        isActive: true,
        deletedAt: null,
      } as any).where(eq(users.id, user.id));
    } else {
      out.userExisted = false;
      // Bare empty account, exactly like a normal signup — NO fiscal data.
      // The user completes their own company profile (CUI/address) in onboarding.
      companyId = nanoid();
      await db.insert(companies).values({
        id: companyId,
        name: EMAIL.split('@')[0],
        country: 'Romania',
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
      out.createdWithTempPassword = TEMP_PASSWORD;
    }
    out.companyId = companyId;

    // The only privileged action: grant a free lifetime license.
    await grantLifetime(companyId, { amountCents: 0 });
    out.license = 'lifetime/active (free)';
    out.note = 'User must complete company fiscal profile (CUI) via onboarding before connecting ANAF.';
    out.ok = true;

    return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    out.ok = false;
    out.error = String((err as Error)?.message || err);
    return new Response(JSON.stringify(out, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
