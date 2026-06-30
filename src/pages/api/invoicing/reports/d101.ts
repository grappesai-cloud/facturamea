// GET /api/invoicing/reports/d101?year=  → D101 (impozit pe profit) computation.
// CSV summary only: the fiscal-result computation (the hard part). The official
// ANAF D101 XML schema is complex and adjustment-heavy; we don't fabricate it —
// the user enters these computed figures into the ANAF smart-PDF form.
import type { APIRoute } from 'astro';
import { collectD101Data, generateD101Csv } from '../../../../lib/declaratii';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const now = new Date();
  const year = Number(url.searchParams.get('year')) || now.getUTCFullYear();
  if (year < 2000 || year > 2100) return new Response(JSON.stringify({ error: 'An invalid' }), { status: 400 });

  try {
    const data = await collectD101Data(locals.user.companyId, year);
    const csv = '﻿' + generateD101Csv(data);
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="D101_${year}.csv"` },
    });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: locals.user.companyId, route: '/api/invoicing/reports/d101', method: 'GET' });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D101.' }), { status: 500 });
  }
};
