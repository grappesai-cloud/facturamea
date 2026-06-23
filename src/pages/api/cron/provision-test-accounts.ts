// TEMP — provision two QA test accounts (idempotent): a VAT-PAYER company owner
// + an accountant sub-user under it. CRON_SECRET guarded. DELETE after handing
// credentials to cowork. Passwords are set directly so login works immediately.
import type { APIRoute } from 'astro';
import { db, users, companies, appLicenses, userCompanyMemberships } from '../../../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword } from '../../../lib/auth';
import { generatePlatformId } from '../../../lib/platform-id';
import { isCronAuthorized } from '../../../lib/cron-auth';

const OWNER = { email: 'test.tva@facturamea.test', pass: 'TestTVA-2026!', name: 'Test Plătitor TVA' };
const ACC = { email: 'test.contabil@facturamea.test', pass: 'TestContabil-2026!', name: 'Test Contabil' };

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const log: string[] = [];

  // Idempotency: bail cleanly if the owner already exists.
  const [exists] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, OWNER.email)).limit(1);
  let companyId: string;
  let ownerId: string;

  if (exists) {
    ownerId = exists.id; companyId = exists.companyId as string;
    log.push('owner already existed, reusing');
  } else {
    companyId = nanoid();
    await db.insert(companies).values({
      id: companyId, name: 'TEST PLATITOR TVA SRL', cui: 'RO40000001', country: 'Romania',
      address: 'Str. Test nr. 1', city: 'București', isVatPayer: true, subscriptionTier: 'lifetime',
    } as any);
    await db.insert(appLicenses).values({
      id: nanoid(), companyId, plan: 'lifetime', status: 'active', activatedAt: new Date(), currency: 'RON',
    } as any);
    ownerId = nanoid();
    await db.insert(users).values({
      id: ownerId, platformId: await generatePlatformId(), email: OWNER.email,
      hashedPassword: await hashPassword(OWNER.pass), name: OWNER.name, userType: 'intermediar',
      companyId, emailVerified: true, isActive: true,
    } as any);
    await db.insert(userCompanyMemberships).values({ userId: ownerId, companyId, role: 'owner', isDefault: true } as any);
    log.push('created VAT-payer company + owner');
  }

  // Accountant sub-user under the same company.
  const [accExists] = await db.select({ id: users.id }).from(users).where(eq(users.email, ACC.email)).limit(1);
  if (accExists) { log.push('accountant already existed'); }
  else {
    const accId = nanoid();
    await db.insert(users).values({
      id: accId, platformId: await generatePlatformId(), email: ACC.email,
      hashedPassword: await hashPassword(ACC.pass), name: ACC.name, userType: 'intermediar',
      companyId, parentUserId: ownerId, emailVerified: true, isActive: true,
    } as any);
    await db.insert(userCompanyMemberships).values({ userId: accId, companyId, role: 'accountant', isDefault: false } as any);
    log.push('created accountant sub-user');
  }

  return new Response(JSON.stringify({
    ok: true, log,
    accounts: {
      owner_vat_payer: { email: OWNER.email, password: OWNER.pass, role: 'owner', vatPayer: true },
      accountant: { email: ACC.email, password: ACC.pass, role: 'accountant', company: 'TEST PLATITOR TVA SRL' },
    },
  }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
