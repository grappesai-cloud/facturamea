// GET  /api/banca/openbanking/connect            -> list RO institutions (banks)
// POST /api/banca/openbanking/connect            -> create a requisition, return { link, requisitionId }
//
// Requires a session (middleware enforces auth for /api/banca/*). Degrades to a
// clear 503 when GoCardless credentials are not configured.

import type { APIRoute } from 'astro';
import {
  isOpenBankingConfigured,
  listInstitutions,
  createRequisition,
} from '../../../../lib/openbanking';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function resolveOrigin(requestUrl: string): string {
  const configured = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  try { return new URL(requestUrl).origin; } catch { return 'https://facturamea.com'; }
}

const NOT_CONFIGURED =
  'Open banking nu este configurat. Setează GOCARDLESS_SECRET_ID și GOCARDLESS_SECRET_KEY pentru a conecta băncile.';

// List available Romanian banks so the UI can offer a picker.
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  if (!isOpenBankingConfigured()) return json({ configured: false, error: NOT_CONFIGURED, institutions: [] }, 503);

  const country = (url.searchParams.get('country') || 'RO').toUpperCase().slice(0, 2);
  const res = await listInstitutions(country);
  if (!res.ok) return json({ configured: true, error: res.error, institutions: [] }, 502);
  return json({ configured: true, institutions: res.data || [] });
};

// Create a consent requisition for the chosen bank.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);
  if (!isOpenBankingConfigured()) return json({ configured: false, error: NOT_CONFIGURED }, 503);

  const body = (await request.json().catch(() => ({}))) as any;
  const institutionId = String(body.institutionId || '').trim();
  if (!institutionId) return json({ error: 'Selectează o bancă.' }, 400);

  const origin = resolveOrigin(request.url);
  // The callback page reads the requisition id from the query string we pass.
  const redirect = `${origin}/api/banca/openbanking/callback`;

  // Tie the reference to the company so a stray callback can't cross companies.
  const reference = `fm-${cid}-${Date.now()}`;
  const res = await createRequisition(institutionId, redirect, reference);
  if (!res.ok || !res.data) return json({ error: res.error || 'Nu am putut iniția conectarea la bancă.' }, 502);

  return json({
    requisitionId: res.data.id,
    link: res.data.link || null,
    status: res.data.status || null,
  });
};
