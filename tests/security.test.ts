import { describe, expect, it } from 'vitest';
import { rateLimit, sanitizeHtml, generateResetToken, isTokenExpired } from '../src/lib/security';

describe('rateLimit', () => {
  it('allows under the limit', () => {
    const k = `test-rl-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(k, 5, 1000);
      expect(r.allowed).toBe(true);
    }
  });

  it('blocks once limit is exceeded', () => {
    const k = `test-rl-block-${Math.random()}`;
    for (let i = 0; i < 5; i++) rateLimit(k, 5, 5000);
    const r = rateLimit(k, 5, 5000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe('sanitizeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(sanitizeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands first', () => {
    expect(sanitizeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('generateResetToken', () => {
  it('returns a 48-char token', () => {
    const t = generateResetToken();
    expect(t).toHaveLength(48);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('isTokenExpired', () => {
  it('returns false for a fresh token', () => {
    expect(isTokenExpired(new Date().toISOString(), 60)).toBe(false);
  });

  it('returns true for an old token', () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(isTokenExpired(old, 60)).toBe(true);
  });
});

// ─── waitlistSignupSchema ─────────────────────────────────────────────────────
import { waitlistSignupSchema } from '../src/lib/validation';

const validPayload = {
  name: 'Ion Popescu',
  email: 'ion@exemplu.ro',
  companyType: 'transportator' as const,
  acceptedTc: true as const,
  acceptedGdpr: true as const,
};

describe('waitlistSignupSchema', () => {
  it('acceptă input valid complet', () => {
    const r = waitlistSignupSchema.safeParse(validPayload);
    expect(r.success).toBe(true);
  });

  it('acceptă input valid cu câmpuri opționale', () => {
    const r = waitlistSignupSchema.safeParse({
      ...validPayload,
      phone: '+40 712 345 678',
      companyName: 'SC Transport SRL',
    });
    expect(r.success).toBe(true);
  });

  it('respinge email invalid', () => {
    const r = waitlistSignupSchema.safeParse({ ...validPayload, email: 'nu-e-email' });
    expect(r.success).toBe(false);
  });

  it('respinge acceptedTc=false', () => {
    const r = waitlistSignupSchema.safeParse({ ...validPayload, acceptedTc: false });
    expect(r.success).toBe(false);
  });

  it('respinge acceptedGdpr=false', () => {
    const r = waitlistSignupSchema.safeParse({ ...validPayload, acceptedGdpr: false });
    expect(r.success).toBe(false);
  });

  it('respinge companyType invalid', () => {
    const r = waitlistSignupSchema.safeParse({ ...validPayload, companyType: 'sofer' });
    expect(r.success).toBe(false);
  });

  it('respinge nume cu mai puțin de 2 caractere', () => {
    const r = waitlistSignupSchema.safeParse({ ...validPayload, name: 'X' });
    expect(r.success).toBe(false);
  });

  it('respinge email lipsă', () => {
    const { email, ...rest } = validPayload;
    const r = waitlistSignupSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('acceptă toate valorile valide de companyType', () => {
    for (const ct of ['transportator', 'expeditie', 'client', 'partener']) {
      const r = waitlistSignupSchema.safeParse({ ...validPayload, companyType: ct });
      expect(r.success).toBe(true);
    }
  });
});
