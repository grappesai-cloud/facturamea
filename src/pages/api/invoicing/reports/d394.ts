// GET /api/invoicing/reports/d394?month=&year=  (or ?from=&to=)
// Downloads the D394 (Declarația informativă 394) XML for the period:
// aggregates issued sales invoices (livrări) and purchase expenses (achiziții)
// grouped by partner CUI, with baza + TVA per line and a rezumat block.

import type { APIRoute } from 'astro';
import { resolvePeriod, collectDeclaratieData, generateD394Xml } from '../../../../lib/declaratii';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });

  const period = resolvePeriod(url.searchParams);
  if (!period) {
    return new Response(JSON.stringify({ error: 'Perioadă invalidă. Folosește ?month=1..12&year= sau ?from=YYYY-MM-DD&to=YYYY-MM-DD' }), { status: 400 });
  }

  let xml: string;
  try {
    const data = await collectDeclaratieData(locals.user.companyId, period);
    xml = generateD394Xml(data);
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: locals.user.companyId,
      route: '/api/invoicing/reports/d394',
      method: 'GET',
      extra: { period },
    });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D394. Încearcă din nou.' }), { status: 500 });
  }

  const filename = `D394_${period.year}_${String(period.month).padStart(2, '0')}.xml`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
