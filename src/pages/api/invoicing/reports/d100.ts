// GET /api/invoicing/reports/d100?month=&year=  (or ?from=&to=)  [&rate=1|3] [&format=csv]
// Declarația 100 — impozit pe veniturile microîntreprinderilor (regim micro /
// neplătitor de TVA), declarat trimestrial. Baza = cifra de afaceri pe perioadă,
// impozit = baza × cota (1% cu salariat, 3% fără). Default XML; ?format=csv pentru
// sumar lizibil.
import type { APIRoute } from 'astro';
import { resolvePeriod, collectDeclaratieData, generateD100Xml, generateD100Csv } from '../../../../lib/declaratii';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });

  const period = resolvePeriod(url.searchParams);
  if (!period) {
    return new Response(JSON.stringify({ error: 'Perioadă invalidă. Folosește ?month=1..12&year= sau ?from=YYYY-MM-DD&to=YYYY-MM-DD' }), { status: 400 });
  }

  const rate = url.searchParams.get('rate') === '3' ? 3 : 1;
  const format = (url.searchParams.get('format') || 'xml').toLowerCase();

  let body: string;
  let contentType: string;
  let ext: string;
  try {
    const data = await collectDeclaratieData(locals.user.companyId, period);
    if (format === 'csv') {
      body = generateD100Csv(data, rate);
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else {
      body = generateD100Xml(data, rate);
      contentType = 'application/xml; charset=utf-8';
      ext = 'xml';
    }
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: locals.user.companyId,
      route: '/api/invoicing/reports/d100',
      method: 'GET',
      extra: { period, rate },
    });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D100. Încearcă din nou.' }), { status: 500 });
  }

  const filename = `D100_${period.year}_T${Math.floor((period.month - 1) / 3) + 1}.${ext}`;
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
