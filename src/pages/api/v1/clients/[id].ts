import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceClients } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiBadRequest, apiNotFound, apiServerError, readJson, asString } from '../../../../lib/api-v1';

const scoped = (id: string, companyId: string) =>
  and(eq(invoiceClients.id, id), eq(invoiceClients.ownerCompanyId, companyId));

// GET /api/v1/clients/:id
export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  try {
    const [row] = await db.select().from(invoiceClients).where(scoped(id, auth.companyId)).limit(1);
    if (!row) return apiNotFound();
    return apiJson(row);
  } catch {
    return apiServerError();
  }
};

// PATCH /api/v1/clients/:id — partial update.
export const PATCH: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  const body = await readJson(request);
  if (!body) return apiBadRequest('Corp JSON invalid.');

  const patch: Record<string, any> = {};
  const strFields = ['name', 'taxId', 'registryNumber', 'country', 'county', 'city', 'address', 'postalCode', 'contactName', 'email', 'phone', 'iban', 'bank', 'notes'] as const;
  for (const f of strFields) {
    if (f in body) patch[f] = asString((body as any)[f]);
  }
  if ('name' in body && !patch.name) return apiBadRequest('Câmpul "name" nu poate fi gol.');
  if ('isVatPayer' in body) patch.isVatPayer = body.isVatPayer === true;
  if (Object.keys(patch).length === 0) return apiBadRequest('Niciun câmp de actualizat.');

  try {
    const [existing] = await db.select({ id: invoiceClients.id }).from(invoiceClients).where(scoped(id, auth.companyId)).limit(1);
    if (!existing) return apiNotFound();
    await db.update(invoiceClients).set(patch).where(scoped(id, auth.companyId));
    const [row] = await db.select().from(invoiceClients).where(scoped(id, auth.companyId)).limit(1);
    return apiJson(row);
  } catch {
    return apiServerError();
  }
};

// DELETE /api/v1/clients/:id
export const DELETE: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();
  const id = params.id;
  if (!id) return apiNotFound();

  try {
    const [existing] = await db.select({ id: invoiceClients.id }).from(invoiceClients).where(scoped(id, auth.companyId)).limit(1);
    if (!existing) return apiNotFound();
    await db.delete(invoiceClients).where(scoped(id, auth.companyId));
    return apiJson({ ok: true, id });
  } catch {
    return apiServerError();
  }
};
