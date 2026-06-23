// HMAC-signed value for the `th_imp` impersonation cookie.
//
// stop-impersonate restores a full ADMIN session from this cookie and is
// middleware-exempt, so the cookie MUST be unforgeable. Previously it stored a
// bare adminId (plaintext) — anyone who knew an admin's userId could forge it
// and obtain an admin session, bypassing the mandatory-2FA gate. We sign
// `adminId` with HMAC-SHA256 over a server secret and verify in constant time.
import crypto from 'node:crypto';

function secret(): string {
  const e = (k: string) => (import.meta as any).env?.[k] ?? process.env[k];
  return (
    e('SESSION_SECRET') || e('AUTH_SECRET') || e('BETTER_AUTH_SECRET') ||
    e('ANAF_ENCRYPTION_KEY') || e('APP_ENCRYPTION_KEY') || e('CRON_SECRET') || ''
  );
}

export function signImp(adminId: string): string {
  const s = secret();
  const mac = crypto.createHmac('sha256', s).update(adminId).digest('base64url');
  return `${adminId}.${mac}`;
}

// Returns the adminId only if the signature is valid; otherwise null.
export function verifyImp(value: string): string | null {
  const s = secret();
  if (!s || !value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const adminId = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = crypto.createHmac('sha256', s).update(adminId).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? adminId : null;
}
