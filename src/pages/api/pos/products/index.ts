// Active products for POS, scoped to the caller's company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceProducts } from '../../../../db/schema';
import { and, eq, ilike, or, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const q = url.searchParams.get('q')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(invoiceProducts.companyId, cid), eq(invoiceProducts.isActive, true)];
    if (q) conds.push(or(ilike(invoiceProducts.name, `%${q}%`), ilike(invoiceProducts.code, `%${q}%`))!);
    results = await db
      .select({
        id: invoiceProducts.id,
        code: invoiceProducts.code,
        name: invoiceProducts.name,
        defaultUnitPriceCents: invoiceProducts.defaultUnitPriceCents,
        defaultUm: invoiceProducts.defaultUm,
        defaultVatRate: invoiceProducts.defaultVatRate,
      })
      .from(invoiceProducts)
      .where(and(...conds))
      .orderBy(desc(invoiceProducts.updatedAt))
      .limit(300);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};
