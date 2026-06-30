// GET /api/invoicing/reports/d205?year=  → D205 (informativă rețineri la sursă) CSV.
import type { APIRoute } from 'astro';
import { listWithholdings, generateD205Csv } from '../../../../lib/withholding';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const year = Number(url.searchParams.get('year')) || new Date().getUTCFullYear();
  try {
    const rows = await listWithholdings(locals.user.companyId, year);
    const csv = generateD205Csv(rows as any, year);
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="D205_${year}.csv"` } });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/d205', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D205.' }), { status: 500 });
  }
};
