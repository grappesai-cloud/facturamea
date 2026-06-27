// One-shot migration: adds expenses.vat_scheme (taxare inversă) + aligns the
// invoice_products default VAT rate to 21%. Idempotent. Guarded by CRON_SECRET.
// Safe to delete after it has been run once on prod.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    await db.execute(sql`ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vat_scheme" varchar(20) DEFAULT 'normal'`);
    await db.execute(sql`ALTER TABLE "invoice_products" ALTER COLUMN "default_vat_rate" SET DEFAULT 21`);
    // e-Factura auto-send: default ON + pornit global pentru firmele existente.
    await db.execute(sql`ALTER TABLE "companies" ALTER COLUMN "efactura_auto_send" SET DEFAULT true`);
    await db.execute(sql`UPDATE "companies" SET "efactura_auto_send" = true WHERE "efactura_auto_send" IS NOT TRUE`);
    return new Response(JSON.stringify({ ok: true, applied: ['expenses.vat_scheme', 'invoice_products.default_vat_rate=21', 'companies.efactura_auto_send=true'] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'migrate failed' }), { status: 500 });
  }
};
