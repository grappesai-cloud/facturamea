// GET /api/anaf/authorize?scope=e-factura|e-transport&redirect=/app/setari/integrari-anaf
//
// Starts the OAuth flow: writes a CSRF state row, then 302-redirects to ANAF.
import type { APIRoute } from 'astro';
import { db, anafOauthStates } from '../../../db';
import { buildAuthorizeUrl, newState, isValidScope } from '../../../lib/anaf/oauth';
import { isConfigured } from '../../../lib/anaf/config';

export const GET: APIRoute = async ({ url, locals, redirect }) => {
  if (!locals.user) return new Response('Neautentificat', { status: 401 });
  if (!locals.user.companyId) return new Response('Utilizatorul nu are firmă asociată', { status: 400 });
  if (!isConfigured()) return new Response('ANAF OAuth nu este configurat (lipsesc ANAF_CLIENT_ID/SECRET/ENCRYPTION_KEY)', { status: 500 });

  const scope = url.searchParams.get('scope') || '';
  if (!isValidScope(scope)) return new Response('Scope invalid (e-factura | e-transport)', { status: 400 });

  // Only allow same-site relative redirects (single leading "/", not "//").
  // Prevents an open redirect carried through the OAuth round-trip.
  const rawRedirect = url.searchParams.get('redirect') || '';
  const redirectAfter = (rawRedirect.startsWith('/') && !rawRedirect.startsWith('//'))
    ? rawRedirect
    : '/app/setari/integrari-anaf';
  const state = newState();

  await db.insert(anafOauthStates).values({
    state,
    companyId: locals.user.companyId,
    userId: locals.user.id,
    scope,
    redirectAfter,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  return redirect(buildAuthorizeUrl(state), 302);
};
