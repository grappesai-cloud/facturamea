import { describe, expect, it, beforeAll } from 'vitest';

// 32 bytes hex (64 chars). Set BEFORE importing the crypto module so
// getKey() picks it up via the env lookup.
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

beforeAll(() => {
  process.env.ANAF_ENCRYPTION_KEY = TEST_KEY;
});

describe('anaf/crypto', () => {
  it('roundtrips: decrypt(encrypt(x)) === x', async () => {
    const { encrypt, decrypt } = await import('../src/lib/anaf/crypto');
    const plain = 'access-token-xyz-123';
    const ct = encrypt(plain);
    expect(ct).not.toBe(plain);
    expect(decrypt(ct)).toBe(plain);
  });

  it('produces different ciphertext for same plaintext (random IV)', async () => {
    const { encrypt } = await import('../src/lib/anaf/crypto');
    const a = encrypt('same input');
    const b = encrypt('same input');
    expect(a).not.toBe(b);
  });

  it('decrypt with tampered ciphertext throws', async () => {
    const { encrypt, decrypt } = await import('../src/lib/anaf/crypto');
    const ct = encrypt('important');
    const buf = Buffer.from(ct, 'base64');
    // Flip a byte in the middle (in the ciphertext body, not IV)
    buf[15] = buf[15] ^ 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('decrypt with wrong key throws', async () => {
    const { encrypt } = await import('../src/lib/anaf/crypto');
    const ct = encrypt('payload');

    // Swap the env key, then re-import via a fresh module instance.
    process.env.ANAF_ENCRYPTION_KEY = 'ff'.repeat(32);
    // The module caches getKey() per-call (reads env each time via config()),
    // so the new key takes effect immediately.
    const { decrypt: decrypt2 } = await import('../src/lib/anaf/crypto');
    expect(() => decrypt2(ct)).toThrow();

    // restore
    process.env.ANAF_ENCRYPTION_KEY = TEST_KEY;
  });

  it('decrypt rejects too-short payload', async () => {
    const { decrypt } = await import('../src/lib/anaf/crypto');
    expect(() => decrypt(Buffer.from('short').toString('base64'))).toThrow(/too short/i);
  });

  it('throws when ANAF_ENCRYPTION_KEY has wrong length', async () => {
    process.env.ANAF_ENCRYPTION_KEY = 'abcd';
    const { encrypt } = await import('../src/lib/anaf/crypto');
    expect(() => encrypt('x')).toThrow(/64 hex chars/);
    process.env.ANAF_ENCRYPTION_KEY = TEST_KEY;
  });

  it('throws when ANAF_ENCRYPTION_KEY is missing', async () => {
    const saved = process.env.ANAF_ENCRYPTION_KEY;
    delete process.env.ANAF_ENCRYPTION_KEY;
    const { encrypt } = await import('../src/lib/anaf/crypto');
    expect(() => encrypt('x')).toThrow(/not set/);
    process.env.ANAF_ENCRYPTION_KEY = saved;
  });
});
