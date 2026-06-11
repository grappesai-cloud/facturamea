// AES-256-GCM token encryption.
// Format: base64( iv(12) || ciphertext || authTag(16) )
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ANAF_ENCRYPTION_KEY } from './config';

function getKey(): Buffer {
  const hex = ANAF_ENCRYPTION_KEY();
  if (!hex) throw new Error('ANAF_ENCRYPTION_KEY not set (32-byte hex required)');
  if (hex.length !== 64) throw new Error('ANAF_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  return Buffer.from(hex, 'hex');
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decrypt(payload: string): string {
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
