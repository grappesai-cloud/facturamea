// ANAF OAuth 2.0 — Authorization Code flow.
// Docs: https://logincert.anaf.ro/anaf-oauth2/v1/
import {
  ANAF_CLIENT_ID, ANAF_CLIENT_SECRET, ANAF_REDIRECT_URI,
  OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, OAUTH_REVOKE_URL,
  type AnafScope,
} from './config';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  // ANAF returns expires_in in seconds; we convert to absolute ms.
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  rawScope: string;
}

// ANAF's OAuth implementation does not use the `scope` query param the
// way standard OAuth providers do — the scopes are implicit in the
// approved application. We still pass `token_content_type=jwt` to get
// a parseable token (CIF lives in the `aud` claim).
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ANAF_CLIENT_ID(),
    redirect_uri: ANAF_REDIRECT_URI(),
    state,
    token_content_type: 'jwt',
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function postForm(url: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ANAF OAuth ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`ANAF OAuth invalid JSON: ${text.slice(0, 200)}`);
  }
}

function expiresFromSeconds(seconds: number | undefined, fallbackDays: number): Date {
  const s = typeof seconds === 'number' && seconds > 0 ? seconds : fallbackDays * 86400;
  return new Date(Date.now() + s * 1000);
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const data = await postForm(OAUTH_TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    client_id: ANAF_CLIENT_ID(),
    client_secret: ANAF_CLIENT_SECRET(),
    redirect_uri: ANAF_REDIRECT_URI(),
    token_content_type: 'jwt',
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpiresAt: expiresFromSeconds(data.expires_in, 90),
    refreshExpiresAt: expiresFromSeconds(data.refresh_token_expires_in, 365),
    rawScope: data.scope || '',
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const data = await postForm(OAUTH_TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: ANAF_CLIENT_ID(),
    client_secret: ANAF_CLIENT_SECRET(),
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // some IdPs don't rotate
    accessExpiresAt: expiresFromSeconds(data.expires_in, 90),
    refreshExpiresAt: expiresFromSeconds(data.refresh_token_expires_in, 365),
    rawScope: data.scope || '',
  };
}

export async function revokeToken(token: string, hint: 'access_token' | 'refresh_token' = 'refresh_token'): Promise<void> {
  try {
    await postForm(OAUTH_REVOKE_URL, {
      token,
      token_type_hint: hint,
      client_id: ANAF_CLIENT_ID(),
      client_secret: ANAF_CLIENT_SECRET(),
    });
  } catch {
    // Best-effort. Even if ANAF rejects, we still drop the local row.
  }
}

// Decode the CIF from a JWT token without verifying the signature
// (we only trust ANAF over TLS during the exchange — this is purely
// to surface "you connected as RO12345678" in the UI).
export function extractCifFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const claims = JSON.parse(json);
    // Different IdPs use different claim names; check the common ones.
    const candidates = [claims.cif, claims.CIF, claims.cui, claims.CUI, claims.aud, claims.sub];
    for (const c of candidates) {
      if (typeof c === 'string') {
        const m = c.match(/\d{2,10}/);
        if (m) return m[0];
      }
    }
  } catch {}
  return null;
}

export function newState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
}

// Used by both scopes — we don't pass scope to ANAF (their app approval
// already determines it), but we track per-scope locally so the UI can
// show "e-Factura connected, e-Transport not".
export function isValidScope(s: string): s is AnafScope {
  return s === 'e-factura' || s === 'e-transport' || s === 'spv';
}
