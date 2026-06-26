// GET /api/invoicing/reports/d212?year=  [&format=csv]
// Declarația unică (D212) pentru PFA/II/IF în sistem real. Impozitul pe venit e
// ANUAL, calculat pe ÎNCASĂRI (contabilitate de casă): venit brut încasat −
// cheltuieli deductibile, impozit 10%. CAS/CASS se raportează informativ (vezi CSV),
// fiindcă depind de plafoane ce se schimbă anual. Default XML; ?format=csv pentru sumar.
import type { APIRoute } from 'astro';
import { collectD212Data, generateD212Xml, generateD212Csv } from '../../../../lib/declaratii';
import { captureError } from '../../../../lib/observability';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });

  const year = Number(url.searchParams.get('year'));
  if (!(year >= 2000 && year <= 2100)) {
    return new Response(JSON.stringify({ error: 'An invalid. Folosește ?year=YYYY' }), { status: 400 });
  }

  const format = (url.searchParams.get('format') || 'xml').toLowerCase();

  let body: string;
  let contentType: string;
  let ext: string;
  try {
    const data = await collectD212Data(locals.user.companyId, year);
    if (format === 'csv') {
      body = generateD212Csv(data);
      contentType = 'text/csv; charset=utf-8';
      ext = 'csv';
    } else {
      body = generateD212Xml(data);
      contentType = 'application/xml; charset=utf-8';
      ext = 'xml';
    }
  } catch (err) {
    await captureError(err, {
      userId: locals.user.id,
      companyId: locals.user.companyId,
      route: '/api/invoicing/reports/d212',
      method: 'GET',
      extra: { year },
    });
    return new Response(JSON.stringify({ error: 'Eroare la generarea D212. Încearcă din nou.' }), { status: 500 });
  }

  const filename = `D212_${year}.${ext}`;
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
