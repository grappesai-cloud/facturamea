// POST /api/admin/create-demo-account — one-shot, admin-only.
// Provisions the Apple/Play review demo account: apple.review@facturamea.com,
// placed in the existing "Demo Studio SRL" company (active lifetime license +
// sample invoices), email pre-verified, with the known demo password. Idempotent:
// if it exists, refreshes password / verification / company. Remove after use.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../../lib/auth';
import { generatePlatformId } from '../../../lib/platform-id';
import { nanoid } from 'nanoid';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const EMAIL = 'apple.review@facturamea.com';
const PASS = 'DemoFacturamea2026!';

export const POST: APIRoute = async ({ locals }) => {
  if (!(locals.user as any)?.isAdmin) return json({ error: 'Acces interzis' }, 403);

  // Borrow the company of the existing demo account (has the active license + data).
  const [demo] = await db.select({ companyId: users.companyId, userType: users.userType })
    .from(users).where(eq(users.email, 'demo@facturamea.com')).limit(1);
  if (!demo?.companyId) return json({ error: 'demo@facturamea.com / company negăsită' }, 404);

  const hashed = await hashPassword(PASS);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (existing) {
    await db.update(users).set({ hashedPassword: hashed, emailVerified: true, companyId: demo.companyId })
      .where(eq(users.id, existing.id));
    return json({ ok: true, updated: true, email: EMAIL, companyId: demo.companyId });
  }

  const platformId = await generatePlatformId();
  await db.insert(users).values({
    id: nanoid(),
    platformId,
    email: EMAIL,
    hashedPassword: hashed,
    name: 'Apple Review',
    userType: (demo.userType as any) || 'intermediar',
    companyId: demo.companyId,
    emailVerified: true,
    referralCode: platformId.replace(/^TH/i, '').toUpperCase(),
  } as any);
  return json({ ok: true, created: true, email: EMAIL, companyId: demo.companyId });
};
