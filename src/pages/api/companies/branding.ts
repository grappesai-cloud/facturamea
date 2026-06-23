// /api/companies/branding — company public branding (logo + description + website),
// edited from /app/setari/branding. Distinct from /api/invoicing/branding, which
// holds invoice-document assets (stamp/signature/footer). Owner-only.
import type { APIRoute } from 'astro';
import { db, companies } from '../../../db';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/require-role';
import { sanitizeHtml } from '../../../lib/security';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.companyId) return json({ error: 'Neautentificat' }, 401);
  const [c] = await db.select({
    logoUrl: companies.logoUrl,
    description: companies.description,
    website: companies.website,
  }).from(companies).where(eq(companies.id, locals.user.companyId));
  return json(c || {});
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.companyId) return json({ error: 'Neautentificat' }, 401);
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.logoUrl !== undefined) patch.logoUrl = String(body.logoUrl || '').slice(0, 1000) || null;
  if (body.description !== undefined) patch.description = sanitizeHtml(String(body.description || '')).slice(0, 2000) || null;
  if (body.website !== undefined) patch.website = String(body.website || '').trim().slice(0, 500) || null;

  await db.update(companies).set(patch as any).where(eq(companies.id, locals.user.companyId));
  return json({ ok: true });
};
