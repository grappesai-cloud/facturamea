import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { appLicenses, companies } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { grantLifetime } from '../../../lib/license';

// /api/admin is guarded by middleware (admins only). We re-check defensively.
function ensureAdmin(locals: App.Locals): Response | null {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}

// GET — list all licenses joined to their company.
export const GET: APIRoute = async ({ locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  try {
    const rows = await db
      .select({
        id: appLicenses.id,
        companyId: appLicenses.companyId,
        companyName: companies.name,
        plan: appLicenses.plan,
        status: appLicenses.status,
        trialEndsAt: appLicenses.trialEndsAt,
        activatedAt: appLicenses.activatedAt,
        amountCents: appLicenses.amountCents,
        currency: appLicenses.currency,
        grantedByAdminId: appLicenses.grantedByAdminId,
        createdAt: appLicenses.createdAt,
        updatedAt: appLicenses.updatedAt,
      })
      .from(appLicenses)
      .leftJoin(companies, eq(appLicenses.companyId, companies.id))
      .orderBy(desc(appLicenses.updatedAt));
    return new Response(JSON.stringify({ results: rows }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// POST — grant a lifetime license to a company (white-label manual grant).
export const POST: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  const body = await request.json().catch(() => ({})) as { companyId?: string };
  if (!body.companyId) {
    return new Response(JSON.stringify({ error: 'companyId lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await grantLifetime(body.companyId, { grantedByAdminId: (locals.user as any)?.id });
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('admin/licente grant failed:', err);
    return new Response(JSON.stringify({ error: 'Eroare la acordarea licenței' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

// PATCH — revoke a license (set status='canceled').
export const PATCH: APIRoute = async ({ request, locals }) => {
  const guard = ensureAdmin(locals);
  if (guard) return guard;

  const body = await request.json().catch(() => ({})) as { companyId?: string; action?: string };
  if (!body.companyId) {
    return new Response(JSON.stringify({ error: 'companyId lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    if (body.action === 'revoke') {
      await db.update(appLicenses).set({ status: 'canceled', updatedAt: new Date() } as any).where(eq(appLicenses.companyId, body.companyId));
    } else {
      return new Response(JSON.stringify({ error: 'Acțiune necunoscută' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('admin/licente revoke failed:', err);
    return new Response(JSON.stringify({ error: 'Eroare la revocarea licenței' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
