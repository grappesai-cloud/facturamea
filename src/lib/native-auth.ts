// Short-lived HMAC-signed token handed to the native app via a custom-scheme
// redirect after an OAuth login that ran in SFSafariViewController / Chrome
// Custom Tab. The app then exchanges it (inside the WKWebView) at
// /api/auth/native-exchange for a real session cookie — this is the only way
// to get the session into the webview, since SFSafariViewController has its own
// cookie jar. Token carries userId + expiry; never the session itself.
import crypto from 'node:crypto';

function secret(): string {
  const e = (k: string) => (import.meta as any).env?.[k] ?? process.env[k];
  return (
    e('SESSION_SECRET') || e('AUTH_SECRET') || e('BETTER_AUTH_SECRET') ||
    e('ANAF_ENCRYPTION_KEY') || e('APP_ENCRYPTION_KEY') || e('CRON_SECRET') || ''
  );
}

export function signNativeAuth(userId: string, ttlSec = 120): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${userId}.${exp}`;
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${mac}`).toString('base64url');
}

// Returns the userId only if the signature is valid and not expired.
export function verifyNativeAuth(token: string): string | null {
  const s = secret();
  if (!s || !token) return null;
  let raw: string;
  try { raw = Buffer.from(token, 'base64url').toString('utf8'); } catch { return null; }
  const i = raw.indexOf('.');
  const j = raw.lastIndexOf('.');
  if (i <= 0 || j <= i) return null;
  const userId = raw.slice(0, i);
  const expStr = raw.slice(i + 1, j);
  const mac = raw.slice(j + 1);
  const expected = crypto.createHmac('sha256', s).update(`${userId}.${expStr}`).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (!Number.isFinite(Number(expStr)) || Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

export const NATIVE_SCHEME = 'com.facturamea.app';
