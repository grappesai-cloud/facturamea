import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { orders, freight, companies } from '../../../db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { toCsv, csvResponse } from '../../../lib/csv';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără companie' }), { status: 400 });

  const cid = locals.user.companyId;

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      assignedAt: orders.assignedAt,
      acceptedAt: orders.acceptedAt,
      loadedAt: orders.loadedAt,
      deliveredAt: orders.deliveredAt,
      closedAt: orders.closedAt,
      loadingCity: freight.loadingCityName,
      loadingCountry: freight.loadingCountry,
      unloadingCity: freight.unloadingCityName,
      unloadingCountry: freight.unloadingCountry,
      price: freight.priceTotal,
      currency: freight.currency,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(freight, eq(orders.freightId, freight.id))
    .where(or(eq(orders.clientCompanyId, cid), eq(orders.carrierCompanyId, cid)))
    .orderBy(desc(orders.createdAt));

  const csv = toCsv(rows as any);
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(`comenzi-${date}.csv`, csv);
};
