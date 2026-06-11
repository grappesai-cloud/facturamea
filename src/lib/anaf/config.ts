// ANAF OAuth + API configuration.
//
// All endpoints come from ANAF's OAuth & SPV documentation. The OAuth
// host is the same for test and prod; it's the API host that swaps
// (api.anaf.ro/test/... vs api.anaf.ro/prod/...).
//
// Env:
//   ANAF_CLIENT_ID         (required for OAuth)
//   ANAF_CLIENT_SECRET     (required for OAuth)
//   ANAF_REDIRECT_URI      (must match the one registered at ANAF)
//   ANAF_API_MODE          'test' | 'prod' (defaults to 'test')
//   ANAF_ENCRYPTION_KEY    32 bytes hex (64 chars) — generate with `openssl rand -hex 32`

const env = (k: string): string | undefined => {
  const ime = (import.meta as any).env as Record<string, string | undefined> | undefined;
  return ime?.[k] ?? process.env[k];
};

export const ANAF_CLIENT_ID = () => env('ANAF_CLIENT_ID') || '';
export const ANAF_CLIENT_SECRET = () => env('ANAF_CLIENT_SECRET') || '';
export const ANAF_REDIRECT_URI = () => env('ANAF_REDIRECT_URI') || 'https://facturamea.com/api/anaf/callback';
export const ANAF_API_MODE = (): 'test' | 'prod' => (env('ANAF_API_MODE') === 'prod' ? 'prod' : 'test');
export const ANAF_ENCRYPTION_KEY = () => env('ANAF_ENCRYPTION_KEY') || '';

export const OAUTH_AUTHORIZE_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize';
export const OAUTH_TOKEN_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/token';
export const OAUTH_REVOKE_URL = 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke';

export const apiBase = () => `https://api.anaf.ro/${ANAF_API_MODE()}`;

// Public, anonymous endpoint — does NOT require OAuth. Used for CUI
// autocompletion at registration. Different host (webservicesp) and
// different schema from the private API.
export const PUBLIC_VAT_LOOKUP_URL = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

export type AnafScope = 'e-factura' | 'e-transport' | 'spv';

export const ALL_SCOPES: AnafScope[] = ['e-factura', 'e-transport'];

export function isConfigured(): boolean {
  return Boolean(ANAF_CLIENT_ID() && ANAF_CLIENT_SECRET() && ANAF_ENCRYPTION_KEY());
}
