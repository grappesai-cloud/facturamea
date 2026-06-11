import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceProducts } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiBadRequest, apiNotFound, apiServerError, readJson, asString, asInt, asNumber } from '../../../../lib/api-v1';

const scoped = (id: string, companyId: string) =>
  and(eq(invoiceProducts.id, id), eq(invoiceProducts.companyId, companyId));

// GET /api/v1/products/:id
export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  try {
    const [row] = await db.select().from(invoiceProducts).where(scoped(id, auth.companyId)).limit(1);
    if (!row) return apiNotFound();
    return apiJson(row);
  } catch {
    return apiServerError();
  }
};

// PATCH /api/v1/products/:id — partial update.
export const PATCH: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  const body = await readJson(request);
  if (!body) return apiBadRequest('Corp JSON invalid.');

  const patch: Record<string, any> = {};
  if ('name' in body) {
    const name = asString(body.name);
    if (!name) return apiBadRequest('Câmpul "name" nu poate fi gol.');
    patch.name = name;
  }
  if ('code' in body) patch.code = asString(body.code);
  if ('description' in body) patch.description = asString(body.description);
  if ('defaultUm' in body) patch.defaultUm = asString(body.defaultUm) || 'buc';
  if ('defaultUnitPriceCents' in body) patch.defaultUnitPriceCents = asInt(body.defaultUnitPriceCents);
  if ('defaultVatRate' in body) patch.defaultVatRate = asNumber(body.defaultVatRate);
  if ('isActive' in body) patch.isActive = body.isActive === true;
  if (Object.keys(patch).length === 0) return apiBadRequest('Niciun câmp de actualizat.');
  patch.updatedAt = new Date();

  try {
    const [existing] = await db.select({ id: invoiceProducts.id }).from(invoiceProducts).where(scoped(id, auth.companyId)).limit(1);
    if (!existing) return apiNotFound();
    await db.update(invoiceProducts).set(patch).where(scoped(id, auth.companyId));
    const [row] = await db.select().from(invoiceProducts).where(scoped(id, auth.companyId)).limit(1);
    return apiJson(row);
  } catch {
    return apiServerError();
  }
};

// DELETE /api/v1/products/:id
export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  try {
    const [existing] = await db.select({ id: invoiceProducts.id }).from(invoiceProducts).where(scoped(id, auth.companyId)).limit(1);
    if (!existing) return apiNotFound();
    await db.delete(invoiceProducts).where(scoped(id, auth.companyId));
    return apiJson({ ok: true, id });
  } catch {
    return apiServerError();
  }
};
