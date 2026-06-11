// Generic secret-at-rest encryption (AES-256-GCM).
// Format: base64( iv(12) || ciphertext || authTag(16) ).
//
// Reuses the existing 32-byte hex key. Prefers APP_ENCRYPTION_KEY, falling
// back to ANAF_ENCRYPTION_KEY so we don't need a new env var in prod where
// the ANAF key is already provisioned. Generate with `openssl rand -hex 32`.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const env = (k: string): string | undefined => {
  const ime = (import.meta as any).env as Record<string, string | undefined> | undefined;
  return ime?.[k] ?? process.env[k];
};

function getKey(): Buffer {
  const hex = env('APP_ENCRYPTION_KEY') || env('ANAF_ENCRYPTION_KEY') || '';
  if (!hex) throw new Error('APP_ENCRYPTION_KEY/ANAF_ENCRYPTION_KEY not set (32-byte hex required)');
  if (hex.length !== 64) throw new Error('Encryption key must be 64 hex chars (32 bytes)');
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 28) throw new Error('Encrypted payload too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const key = getKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
