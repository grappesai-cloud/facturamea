import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../lib/api-keys';
import { apiServerError } from '../../../lib/api-v1';

// GET /api/v1/ping — auth test. Returns the company tied to the API key.
export const GET: APIRoute = async ({ request }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();

  try {
    const [company] = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, auth.companyId))
      .limit(1);
    return apiJson({ ok: true, company: company ? { id: company.id, name: company.name } : { id: auth.companyId, name: null } });
  } catch {
    // No DB connected — still confirm the key resolved.
    return apiServerError();
  }
};
