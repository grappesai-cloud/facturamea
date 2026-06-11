import { generateSecret as genSecret, generateURI, verifySync } from 'otplib';
import { generateSync as totpGenerate } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// otplib v13+ functional API. Defaults: SHA1, 6 digits, 30s step,
// ±1 step verification window — matches every standard authenticator
// app (Google Authenticator, 1Password, Authy, etc.).

const ISSUER = 'facturamea';

export function generateSecret(): string {
  return genSecret({ length: 20 });
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function buildQrDataUrl(otpAuthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUrl, { width: 256, margin: 1 });
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  const cleaned = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    // ±1 step (30s) tolerance for clock drift
    // 30s tolerance (1 step) for clock drift between server and authenticator
    const result = verifySync({ token: cleaned, secret, epochTolerance: 30 });
    return Boolean(result?.valid);
  } catch {
    return false;
  }
}

// Returns 10 single-use recovery codes (8 chars, base32-style for legibility).
// We store bcrypt hashes only; the plaintext is shown to the user once.
export function generateRecoveryCodes(): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  return Array.from({ length: 10 }, () => {
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += alphabet[crypto.randomInt(alphabet.length)];
    }
    return code.slice(0, 4) + '-' + code.slice(4);
  });
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 8)));
}

// Returns the index of the consumed code so caller can remove it,
// or -1 if no match.
export async function consumeRecoveryCode(input: string, hashes: string[]): Promise<number> {
  const cleaned = input.replace(/\s+/g, '').toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(cleaned, hashes[i])) return i;
  }
  return -1;
}

// Used in tests to generate the current valid token for a given secret.
export function generateCurrentToken(secret: string): string {
  return totpGenerate({ secret });
}
