import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { transportInvoices, transportInvoiceLines } from '../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { requireApiKey, apiUnauthorized, apiJson } from '../../../../lib/api-keys';
import { apiNotFound, apiServerError } from '../../../../lib/api-v1';

// GET /api/v1/invoices/:id — fetch one invoice (with its lines), scoped to the
// authenticated company.
export const GET: APIRoute = async ({ request, params }) => {
  const auth = await requireApiKey(request);
  if (!auth) return apiUnauthorized();

  const id = params.id;
  if (!id) return apiNotFound();

  try {
    const [inv] = await db
      .select()
      .from(transportInvoices)
      .where(and(eq(transportInvoices.id, id), eq(transportInvoices.companyId, auth.companyId)))
      .limit(1);
    if (!inv) return apiNotFound();

    const lines = await db
      .select()
      .from(transportInvoiceLines)
      .where(eq(transportInvoiceLines.invoiceId, id))
      .orderBy(asc(transportInvoiceLines.position));

    return apiJson({ ...inv, lines });
  } catch {
    return apiServerError();
  }
};
