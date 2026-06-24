import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceProducts } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiBadRequest, apiServerError, readJson, parsePaging, asString, asInt, asNumber } from '../../../../lib/api-v1';

// GET /api/v1/products?limit=&offset= — list the company catalogue.
export const GET: APIRoute = async ({ request, url }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();

  const { limit, offset } = parsePaging(url);
  try {
    const rows = await db
      .select()
      .from(invoiceProducts)
      .where(eq(invoiceProducts.companyId, auth.companyId))
      .orderBy(desc(invoiceProducts.createdAt))
      .limit(limit)
      .offset(offset);
    return apiJson({ data: rows, limit, offset });
  } catch {
    return apiServerError();
  }
};

// POST /api/v1/products — create a product / service.
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireApiKey(request, { write: true });
  if (!auth) return apiUnauthorized();

  const body = await readJson(request);
  if (!body) return apiBadRequest('Corp JSON invalid.');

  const name = asString(body.name);
  if (!name) return apiBadRequest('Câmpul "name" este obligatoriu.');

  const defaultUnitPriceCents = 'defaultUnitPriceCents' in body ? asInt(body.defaultUnitPriceCents) : null;
  const defaultVatRate = 'defaultVatRate' in body ? asNumber(body.defaultVatRate) : null;

  const id = nanoid();
  try {
    await db.insert(invoiceProducts).values({
      id,
      companyId: auth.companyId,
      code: asString(body.code),
      name,
      description: asString(body.description),
      defaultUnitPriceCents: defaultUnitPriceCents ?? undefined,
      defaultUm: asString(body.defaultUm) || 'buc',
      defaultVatRate: defaultVatRate ?? undefined,
      isActive: body.isActive === false ? false : true,
    });
    const [created] = await db.select().from(invoiceProducts).where(eq(invoiceProducts.id, id)).limit(1);
    return apiJson(created ?? { id, name }, 201);
  } catch {
    return apiServerError();
  }
};
