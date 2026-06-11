// OAuth helpers for facturamea — Google + Apple "Sign in with".
// Lightweight authorization-code flow on top of the custom session system.
import crypto from 'node:crypto';

const env = (k: string) => (import.meta as any).env?.[k] ?? process.env[k] ?? '';

export function appOrigin(requestUrl: string): string {
  const configured = env('PUBLIC_APP_URL');
  if (configured) return configured.replace(/\/$/, '');
  try { return new URL(requestUrl).origin; } catch { return 'http://localhost:4321'; }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomState(): string {
  return crypto.randomBytes(24).toString('hex');
}

// ─── Google ──────────────────────────────────────────────────────────────
export function googleConfigured(): boolean {
  return !!(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
}

export function googleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function googleExchange(origin: string, code: string): Promise<{ email: string; name?: string; avatarUrl?: string }> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error('Google token exchange failed');
  const token = await tokenRes.json();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!userRes.ok) throw new Error('Google userinfo failed');
  const u = await userRes.json();
  if (!u.email) throw new Error('Google nu a returnat un email');
  return { email: u.email, name: u.name, avatarUrl: u.picture };
}

// ─── Apple ───────────────────────────────────────────────────────────────
export function appleConfigured(): boolean {
  return !!(env('APPLE_CLIENT_ID') && env('APPLE_TEAM_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY'));
}

export function appleAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env('APPLE_CLIENT_ID'),
    redirect_uri: `${origin}/api/auth/apple/callback`,
    response_type: 'code',
    response_mode: 'form_post', // required to receive `name`/`email` scope
    scope: 'name email',
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params}`;
}

// Build the ES256-signed client_secret JWT Apple requires.
function appleClientSecret(): string {
  const teamId = env('APPLE_TEAM_ID');
  const clientId = env('APPLE_CLIENT_ID');
  const keyId = env('APPLE_KEY_ID');
  const pem = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 30,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const key = crypto.createPrivateKey(pem);
  const sig = crypto.sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64url(sig)}`;
}

export async function appleExchange(origin: string, code: string): Promise<{ email?: string; sub: string }> {
  const res = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('APPLE_CLIENT_ID'),
      client_secret: appleClientSecret(),
      redirect_uri: `${origin}/api/auth/apple/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('Apple token exchange failed');
  const token = await res.json();
  // id_token came directly from Apple's TLS endpoint — decode the claims.
  const claims = JSON.parse(Buffer.from(token.id_token.split('.')[1], 'base64').toString('utf8'));
  return { email: claims.email, sub: claims.sub };
}
