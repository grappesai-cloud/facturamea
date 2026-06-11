import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { nudgesForInvoice } from '../../../../../lib/invoice-nudges';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const id = params.id as string;
  const [inv] = await db.select({ companyId: transportInvoices.companyId }).from(transportInvoices).where(eq(transportInvoices.id, id)).limit(1);
  if (!inv || inv.companyId !== locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără acces' }), { status: 403 });
  const nudges = await nudgesForInvoice(id);
  return new Response(JSON.stringify({ nudges }), { headers: { 'Content-Type': 'application/json' } });
};
