// GET /api/banca/openbanking/callback?ref=<reference>&...
//
// GoCardless redirects the user's browser here after they authorize (or
// decline) access at their bank. GoCardless appends our `reference` as `ref`
// and may add `error` / `details`. We don't import here (the requisition may
// need a moment to settle); instead we bounce back to the bank page with flags
// so the React island can run the sync against the stored requisition id.
//
// Requires a session (middleware enforces auth for /api/banca/*).

import type { APIRoute } from 'astro';
import { isOpenBankingConfigured } from '../../../../lib/openbanking';

function resolveOrigin(requestUrl: string): string {
  const configured = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');
  try { return new URL(requestUrl).origin; } catch { return 'https://facturamea.com'; }
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  if (!locals.user) return Response.redirect(`${resolveOrigin(request.url)}/auth/login`, 302);

  const origin = resolveOrigin(request.url);
  const base = `${origin}/app/banca`;

  if (!isOpenBankingConfigured()) {
    return Response.redirect(`${base}?openbanking=neconfigurat`, 302);
  }

  const ref = url.searchParams.get('ref') || '';
  const error = url.searchParams.get('error') || '';

  const target = new URL(base);
  if (error) {
    target.searchParams.set('openbanking', 'eroare');
    target.searchParams.set('details', error.slice(0, 120));
  } else {
    target.searchParams.set('openbanking', 'autorizat');
  }
  if (ref) target.searchParams.set('ref', ref);

  return Response.redirect(target.toString(), 302);
};
