import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceClients } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiBadRequest, apiServerError, readJson, parsePaging, asString } from '../../../../lib/api-v1';

// GET /api/v1/clients?limit=&offset= — list external clients owned by the company.
export const GET: APIRoute = async ({ request, url }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();

  const { limit, offset } = parsePaging(url);
  try {
    const rows = await db
      .select()
      .from(invoiceClients)
      .where(eq(invoiceClients.ownerCompanyId, auth.companyId))
      .orderBy(desc(invoiceClients.createdAt))
      .limit(limit)
      .offset(offset);
    return apiJson({ data: rows, limit, offset });
  } catch {
    return apiServerError();
  }
};

// POST /api/v1/clients — create an external client.
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApiKey(request, { write: true });
  if (!auth) return apiUnauthorized();

  const body = await readJson(request);
  if (!body) return apiBadRequest('Corp JSON invalid.');

  const name = asString(body.name);
  if (!name) return apiBadRequest('Câmpul "name" este obligatoriu.');

  const id = nanoid();
  try {
    await db.insert(invoiceClients).values({
      id,
      ownerCompanyId: auth.companyId,
      name,
      taxId: asString(body.taxId),
      isVatPayer: body.isVatPayer === true,
      registryNumber: asString(body.registryNumber),
      country: asString(body.country) || 'Romania',
      county: asString(body.county),
      city: asString(body.city),
      address: asString(body.address),
      postalCode: asString(body.postalCode),
      contactName: asString(body.contactName),
      email: asString(body.email),
      phone: asString(body.phone),
      iban: asString(body.iban),
      bank: asString(body.bank),
      notes: asString(body.notes),
    });
    const [created] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, id)).limit(1);
    return apiJson(created ?? { id, name }, 201);
  } catch {
    return apiServerError();
  }
};
