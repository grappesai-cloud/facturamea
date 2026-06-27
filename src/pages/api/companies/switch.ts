// GET  /api/companies/switch — list the companies the signed-in user belongs to.
// POST /api/companies/switch { companyId } — set it as the active company.
//
// The active company is `users.companyId` (the middleware reads it on every
// request). Switching just repoints it, after verifying membership. Used by the
// CompanySwitcher dropdown and by the accountant cockpit's "Deschide firma".
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users, userCompanyMemberships, companies } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautentificat' }, 401);
  try {
    const rows = await db
      .select({
        company_id: userCompanyMemberships.companyId,
        name: companies.name,
        role: userCompanyMemberships.role,
        is_default: userCompanyMemberships.isDefault,
      })
      .from(userCompanyMemberships)
      .innerJoin(companies, eq(companies.id, userCompanyMemberships.companyId))
      .where(eq(userCompanyMemberships.userId, locals.user.id))
      .orderBy(companies.name);
    return json({ results: rows });
  } catch {
    return json({ results: [] });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautentificat' }, 401);
  const body = await request.json().catch(() => ({})) as any;
  const companyId = String(body.companyId || '').trim();
  if (!companyId) return json({ error: 'Firmă lipsă' }, 400);

  // Verify the user is actually a member of the target company.
  const [member] = await db
    .select({ companyId: userCompanyMemberships.companyId })
    .from(userCompanyMemberships)
    .where(and(eq(userCompanyMemberships.userId, locals.user.id), eq(userCompanyMemberships.companyId, companyId)))
    .limit(1);
  if (!member) return json({ error: 'Nu ai acces la această firmă.' }, 403);

  try {
    await db.update(users).set({ companyId }).where(eq(users.id, locals.user.id));
  } catch {
    return json({ error: 'Nu am putut schimba firma.' }, 500);
  }
  return json({ ok: true });
};
