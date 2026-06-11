// GET /api/invoicing/fx/bnr?date=YYYY-MM-DD&currency=EUR
// Returns BNR exchange rate (RON per 1 unit of currency). For invoice issuance.

import type { APIRoute } from 'astro';
import { getBnrRate } from '../../../../lib/bnr-fx';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const currency = (url.searchParams.get('currency') || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return new Response(JSON.stringify({ error: 'Currency invalid (ISO 4217 3 chars)' }), { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Response(JSON.stringify({ error: 'Date invalid (YYYY-MM-DD)' }), { status: 400 });
  }

  const result = await getBnrRate(date, currency);
  if (!result) {
    return new Response(JSON.stringify({ error: 'Rate not found for date+currency' }), { status: 404 });
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
};
