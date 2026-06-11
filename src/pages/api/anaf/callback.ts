// GET /api/anaf/callback?code=...&state=...
//
// Validates state (CSRF + continuity), exchanges code for tokens,
// saves the per-company connection (encrypted), then redirects back
// to the page that initiated the flow.
import type { APIRoute } from 'astro';
import { db, anafOauthStates } from '../../../db';
import { eq } from 'drizzle-orm';
import { exchangeCodeForTokens, extractCifFromJwt, isValidScope } from '../../../lib/anaf/oauth';
import { saveConnection } from '../../../lib/anaf/tokens';
import { isConfigured } from '../../../lib/anaf/config';

function errorPage(msg: string, redirectTo = '/app/setari/integrari-anaf'): Response {
  const url = `${redirectTo}?anaf_error=${encodeURIComponent(msg)}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

export const GET: APIRoute = async ({ url }) => {
  if (!isConfigured()) return new Response('ANAF OAuth nu este configurat', { status: 500 });

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  if (err) return errorPage(`ANAF a refuzat autorizarea: ${err}`);
  if (!code || !state) return errorPage('Lipsesc parametrii (code/state)');

  const [stateRow] = await db.select().from(anafOauthStates).where(eq(anafOauthStates.state, state)).limit(1);
  if (!stateRow) return errorPage('State invalid sau expirat');
  await db.delete(anafOauthStates).where(eq(anafOauthStates.state, state));
  if (stateRow.expiresAt.getTime() < Date.now()) return errorPage('State expirat');
  if (!isValidScope(stateRow.scope)) return errorPage('Scope invalid');

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (e) {
    return errorPage(e instanceof Error ? e.message : 'Eroare schimb cod→token');
  }

  const cif = extractCifFromJwt(tokens.accessToken);

  try {
    await saveConnection({
      companyId: stateRow.companyId,
      userId: stateRow.userId,
      scope: stateRow.scope,
      cif,
      tokens,
    });
  } catch (e) {
    return errorPage(e instanceof Error ? e.message : 'Eroare salvare conexiune');
  }

  const dest = `${stateRow.redirectAfter || '/app/setari/integrari-anaf'}?anaf_connected=${encodeURIComponent(stateRow.scope)}${cif ? `&cif=${encodeURIComponent(cif)}` : ''}`;
  return new Response(null, { status: 302, headers: { Location: dest } });
};
