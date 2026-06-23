// /api/companies/profile — edit the company's own bank details (IBAN + bank)
// that print on every issued invoice (issuer.iban). Legal fields (name/CUI) stay
// locked. Owner/accountant only.
import type { APIRoute } from 'astro';
import { db, companies } from '../../../db';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/require-role';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.companyId) return json({ error: 'Neautentificat' }, 401);
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.iban !== undefined) {
    // Normalize: strip spaces, uppercase. Empty clears it.
    const iban = String(body.iban || '').replace(/\s+/g, '').toUpperCase();
    if (iban && !/^[A-Z0-9]{5,34}$/.test(iban)) return json({ error: 'IBAN invalid' }, 400);
    patch.iban = iban || null;
  }
  if (body.bank !== undefined) {
    patch.bank = String(body.bank || '').trim().slice(0, 80) || null;
  }
  if (body.phone !== undefined) {
    patch.phone = String(body.phone || '').trim().slice(0, 50) || null;
  }

  await db.update(companies).set(patch as any).where(eq(companies.id, locals.user.companyId));
  return json({ ok: true });
};
