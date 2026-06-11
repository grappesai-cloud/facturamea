// GET /api/invoicing/reports/saft-d406?from=YYYY-MM-DD&to=YYYY-MM-DD&type=L
// Downloads the D406 SAF-T XML for the given period.

import type { APIRoute } from 'astro';
import { generateD406Xml } from '../../../../lib/d406-saft';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const type = (url.searchParams.get('type') as 'L'|'T'|'A'|'C') || 'L';

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response(JSON.stringify({ error: 'from + to required (YYYY-MM-DD)' }), { status: 400 });
  }

  const xml = await generateD406Xml({ companyId: locals.user.companyId, from, to, declarationType: type });
  const filename = `D406_${from}_${to}.xml`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
