// TEMP one-shot: dump a D406 SAF-T XML for XSD validation. CRON_SECRET-guarded. Remove after use.
import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { generateD406Xml } from '../../../lib/d406-saft';

export const GET: APIRoute = async ({ request, url }) => {
  if (!isCronAuthorized(request)) return new Response('forbidden', { status: 403 });
  const companyId = url.searchParams.get('companyId') || '';
  const from = url.searchParams.get('from') || '2026-01-01';
  const to = url.searchParams.get('to') || '2026-12-31';
  if (!companyId) return new Response('companyId required', { status: 400 });
  const xml = await generateD406Xml({ companyId, from, to });
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml' } });
};
