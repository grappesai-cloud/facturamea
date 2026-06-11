// Products/services catalog (nomenclator) for invoice issuance.
// CRUD scoped to the caller's company.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceProducts } from '../../../../db/schema';
import { and, eq, desc, ilike, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const q = url.searchParams.get('q')?.trim();
  const activeOnly = url.searchParams.get('active') !== '0';

  const conds: any[] = [eq(invoiceProducts.companyId, cid)];
  if (activeOnly) conds.push(eq(invoiceProducts.isActive, true));
  if (q) conds.push(or(
    ilike(invoiceProducts.name, `%${q}%`),
    ilike(invoiceProducts.code, `%${q}%`),
  ));

  const results = await db.select().from(invoiceProducts)
    .where(and(...conds))
    .orderBy(desc(invoiceProducts.updatedAt))
    .limit(200);
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const name = String(body.name || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Numele e obligatoriu' }), { status: 400 });

  const id = nanoid();
  await db.insert(invoiceProducts).values({
    id, companyId: cid,
    code: body.code?.trim() || null,
    name,
    description: body.description?.trim() || null,
    defaultUnitPriceCents: body.defaultUnitPriceCents != null ? Math.round(Number(body.defaultUnitPriceCents)) : null,
    defaultCurrency: (body.defaultCurrency || 'RON').toUpperCase().slice(0, 5),
    defaultUm: (body.defaultUm || 'buc').slice(0, 16),
    defaultVatRate: body.defaultVatRate != null ? Number(body.defaultVatRate) : 19,
    productType: body.productType || 'Servicii',
    isActive: body.isActive !== false,
  } as any);
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const [exists] = await db.select().from(invoiceProducts).where(and(eq(invoiceProducts.id, body.id), eq(invoiceProducts.companyId, cid))).limit(1);
  if (!exists) return new Response(JSON.stringify({ error: 'Produs inexistent' }), { status: 404 });

  const patch: any = { updatedAt: new Date() };
  if (body.code !== undefined) patch.code = body.code?.trim() || null;
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.defaultUnitPriceCents !== undefined) patch.defaultUnitPriceCents = body.defaultUnitPriceCents != null ? Math.round(Number(body.defaultUnitPriceCents)) : null;
  if (body.defaultCurrency !== undefined) patch.defaultCurrency = String(body.defaultCurrency).toUpperCase().slice(0, 5);
  if (body.defaultUm !== undefined) patch.defaultUm = String(body.defaultUm).slice(0, 16);
  if (body.defaultVatRate !== undefined) patch.defaultVatRate = Number(body.defaultVatRate);
  if (body.productType !== undefined) patch.productType = body.productType;
  if (body.isActive !== undefined) patch.isActive = !!body.isActive;

  await db.update(invoiceProducts).set(patch).where(eq(invoiceProducts.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  // Soft-delete: deactivate instead of removing — invoices snapshot lines anyway, but admins may want history.
  await db.update(invoiceProducts).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(invoiceProducts.id, id), eq(invoiceProducts.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
