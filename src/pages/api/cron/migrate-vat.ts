// TEMPORARY migration — add companies.is_vat_payer to the live DB and backfill
// every company's VAT-payer status from ANAF's public register. Guarded by
// CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db, companies } from '../../../db';
import { eq, isNotNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { lookupAnaf } from '../../../lib/anaf-lookup';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  // 1) Add the column if it doesn't exist yet (idempotent).
  try {
    await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_vat_payer boolean`);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, step: 'alter', error: String((e as Error).message) }), { status: 500 });
  }

  // 2) Backfill VAT-payer status from ANAF for every company that has a CUI.
  const rows = await db.select({ id: companies.id, cui: companies.cui }).from(companies).where(isNotNull(companies.cui));
  const out: any[] = [];
  for (const r of rows) {
    const cui = String(r.cui || '').replace(/^RO/i, '').replace(/\D/g, '');
    if (!cui) continue;
    try {
      const a = await lookupAnaf(cui);
      if (a.ok) {
        await db.update(companies).set({ isVatPayer: a.isVatPayer } as any).where(eq(companies.id, r.id));
        out.push({ cui, isVatPayer: a.isVatPayer, name: a.name });
      } else {
        out.push({ cui, error: a.error });
      }
    } catch (e) {
      out.push({ cui, error: String((e as Error).message) });
    }
  }

  return new Response(JSON.stringify({ ok: true, updated: out }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
