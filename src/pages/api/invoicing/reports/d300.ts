// GET /api/invoicing/reports/d300?month=&year=  (or ?from=&to=)  [&format=csv]
// Downloads the D300 (Decont TVA) summary for the period: TVA colectată din
// livrări, TVA deductibilă din achiziții, sold (de plată / de recuperat).
// Default format is XML; pass ?format=csv for a human-readable summary.

import type { APIRoute } from 'astro';
import { resolvePeriod, collectDeclaratieData, generateD300Xml, generateD300Csv } from '../../../../lib/declaratii';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });

  const period = resolvePeriod(url.searchParams);
  if (!period) {
    return new Response(JSON.stringify({ error: 'Perioadă invalidă. Folosește ?month=1..12&year= sau ?from=YYYY-MM-DD&to=YYYY-MM-DD' }), { status: 400 });
  }

  const format = (url.searchParams.get('format') || 'xml').toLowerCase();

  let body: string;
  let contentType: string;
  let ext: string;
  try {
    const data = await collectDeclaratieData(locals.user.companyId, period);
    if (format === 'csv') {
      body = generateD300Csv(data);
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else {
      body = generateD300Xml(data);
      contentType = 'application/xml; charset=utf-8';
      ext = 'xml';
    }
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: locals.user.companyId,
      route: '/api/invoicing/reports/d300',
      method: 'GET',
      extra: { period },
    });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D300. Încearcă din nou.' }), { status: 500 });
  }

  const filename = `D300_${period.year}_${String(period.month).padStart(2, '0')}.${ext}`;
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
