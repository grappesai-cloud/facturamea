import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { freight } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { toCsv, csvResponse } from '../../../lib/csv';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără companie' }), { status: 400 });

  const rows = await db
    .select()
    .from(freight)
    .where(eq(freight.companyId, locals.user.companyId))
    .orderBy(desc(freight.createdAt));

  const mapped = rows.map((r) => ({
    id: r.id,
    status: r.status,
    contract_type: r.contractType,
    loading_city: r.loadingCityName,
    loading_country: r.loadingCountry,
    unloading_city: r.unloadingCityName,
    unloading_country: r.unloadingCountry,
    loading_date: r.loadingDate,
    weight_kg: r.weight,
    volume_m3: r.volume,
    distance_km: r.distanceKm,
    price: r.priceTotal,
    currency: r.currency,
    description: r.description,
    created_at: r.createdAt,
  }));

  const csv = toCsv(mapped);
  const date = new Date().toISOString().slice(0, 10);
  return csvResponse(`marfa-${date}.csv`, csv);
};
