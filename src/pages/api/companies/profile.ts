// /api/companies/profile — edit the company's contact phone (on `companies`)
// and the bank details that print on invoices (IBAN + bank). IBAN/bank live on
// the default `billing_addresses` row (the invoice issuer profile), NOT on
// `companies` — that table has no iban column. Owner/accountant only.
import type { APIRoute } from 'astro';
import { db, companies, billingAddresses } from '../../../db';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../lib/require-role';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ request, locals }) => {
  const companyId = locals.user?.companyId;
  if (!companyId) return json({ error: 'Neautentificat' }, 401);
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Phone + fiscal identifiers (reg. com., CAEN) live on the company row. CAEN +
  // reg. com. are required by D112 and the annual financial statements.
  const coPatch: Record<string, unknown> = {};
  if (body.phone !== undefined) coPatch.phone = String(body.phone || '').trim().slice(0, 50) || null;
  if (body.regCom !== undefined) coPatch.regCom = String(body.regCom || '').trim().slice(0, 50) || null;
  if (body.caen !== undefined) coPatch.caen = String(body.caen || '').replace(/\D/g, '').slice(0, 10) || null;
  if (Object.keys(coPatch).length) {
    await db.update(companies)
      .set({ ...coPatch, updatedAt: new Date() } as any)
      .where(eq(companies.id, companyId));
  }

  // IBAN + bank live on the default billing profile (prints on invoices).
  if (body.iban !== undefined || body.bank !== undefined) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.iban !== undefined) {
      const iban = String(body.iban || '').replace(/\s+/g, '').toUpperCase();
      if (iban && !/^[A-Z0-9]{5,34}$/.test(iban)) return json({ error: 'IBAN invalid' }, 400);
      patch.iban = iban || null;
    }
    if (body.bank !== undefined) patch.bank = String(body.bank || '').trim().slice(0, 200) || null;

    const [billing] = await db.select().from(billingAddresses)
      .where(eq(billingAddresses.companyId, companyId))
      .orderBy(desc(billingAddresses.isDefault))
      .limit(1);

    if (billing) {
      await db.update(billingAddresses).set(patch as any).where(eq(billingAddresses.id, billing.id));
    } else {
      // No issuer profile yet — seed one. legal_name AND city are NOT NULL, so
      // carry the company's city/country across (city omitted → 23502 on insert).
      const [co] = await db.select({
        name: companies.name, cui: companies.cui, address: companies.address,
        city: companies.city, regCom: companies.regCom,
      }).from(companies).where(eq(companies.id, companyId)).limit(1);
      await db.insert(billingAddresses).values({
        id: nanoid(),
        companyId,
        legalName: co?.name || 'Firma',
        cui: co?.cui || null,
        regCom: co?.regCom || null,
        address: co?.address || '',
        city: co?.city || '',
        countryCode: 'RO',
        isDefault: true,
        iban: (patch.iban as string) ?? null,
        bank: (patch.bank as string) ?? null,
      } as any);
    }
  }

  return json({ ok: true });
};
