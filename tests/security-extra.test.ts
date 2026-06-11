import { describe, expect, it } from 'vitest';
import {
  rateLimit,
  getClientIp,
  getClientCountry,
  isAllowedStorageUrl,
  sanitizeHtml,
  stripControlChars,
} from '../src/lib/security';

describe('rateLimit (sliding window)', () => {
  it('allows up to maxRequests then blocks', () => {
    const k = `rl-${Math.random()}`;
    for (let i = 0; i < 4; i++) {
      expect(rateLimit(k, 4, 10_000).allowed).toBe(true);
    }
    const blocked = rateLimit(k, 4, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('window expires after windowMs (very short window)', async () => {
    const k = `rl-exp-${Math.random()}`;
    rateLimit(k, 1, 30);
    const second = rateLimit(k, 1, 30);
    expect(second.allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    const third = rateLimit(k, 1, 30);
    expect(third.allowed).toBe(true);
  });

  it('reports decreasing remaining count', () => {
    const k = `rl-rem-${Math.random()}`;
    const a = rateLimit(k, 3, 5000);
    const b = rateLimit(k, 3, 5000);
    expect(a.remaining).toBe(2);
    expect(b.remaining).toBe(1);
  });
});

function reqWith(headers: Record<string, string>): Request {
  return new Request('http://x', { headers });
}

describe('getClientIp', () => {
  it('prefers x-vercel-forwarded-for', () => {
    expect(
      getClientIp(reqWith({
        'x-vercel-forwarded-for': '9.9.9.9',
        'x-real-ip': '2.2.2.2',
        'x-forwarded-for': '3.3.3.3',
      }))
    ).toBe('9.9.9.9');
  });

  it('does NOT trust spoofable cf-connecting-ip (we deploy behind Vercel, not Cloudflare)', () => {
    // Attacker sets cf-connecting-ip; we must ignore it and use the Vercel-set header.
    expect(
      getClientIp(reqWith({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))
    ).toBe('2.2.2.2');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(reqWith({ 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' }))).toBe('2.2.2.2');
  });

  it('falls back to first x-forwarded-for entry', () => {
    expect(getClientIp(reqWith({ 'x-forwarded-for': '3.3.3.3, 4.4.4.4' }))).toBe('3.3.3.3');
  });

  it('returns "unknown" when no header present', () => {
    expect(getClientIp(reqWith({}))).toBe('unknown');
  });
});

describe('getClientCountry', () => {
  it('returns null for missing header', () => {
    expect(getClientCountry(reqWith({}))).toBe(null);
  });
  it('returns null for XX', () => {
    expect(getClientCountry(reqWith({ 'cf-ipcountry': 'XX' }))).toBe(null);
  });
  it('returns null for T1 (Tor)', () => {
    expect(getClientCountry(reqWith({ 'cf-ipcountry': 'T1' }))).toBe(null);
  });
  it('returns uppercase ISO code', () => {
    expect(getClientCountry(reqWith({ 'cf-ipcountry': 'ro' }))).toBe('RO');
  });
});

describe('isAllowedStorageUrl', () => {
  it('allows vercel-storage blob domains', () => {
    expect(isAllowedStorageUrl('https://foo.public.blob.vercel-storage.com/x.png')).toBe(true);
    expect(isAllowedStorageUrl('https://abc.blob.vercel-storage.com/x.png')).toBe(true);
  });

  it('allows transporthub.ro', () => {
    expect(isAllowedStorageUrl('https://transporthub.ro/uploads/file.pdf')).toBe(true);
    expect(isAllowedStorageUrl('https://www.transporthub.ro/file.pdf')).toBe(true);
  });

  it('rejects evil.com', () => {
    expect(isAllowedStorageUrl('https://evil.com/x.png')).toBe(false);
  });

  it('rejects file://', () => {
    expect(isAllowedStorageUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects javascript:', () => {
    expect(isAllowedStorageUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty / non-string', () => {
    expect(isAllowedStorageUrl('')).toBe(false);
    // @ts-expect-error testing non-string runtime
    expect(isAllowedStorageUrl(null)).toBe(false);
  });

  it('rejects malformed URL', () => {
    expect(isAllowedStorageUrl('not a url')).toBe(false);
  });
});

describe('sanitizeHtml', () => {
  it('escapes <, >, &, ", and \'', () => {
    expect(sanitizeHtml('<')).toBe('&lt;');
    expect(sanitizeHtml('>')).toBe('&gt;');
    expect(sanitizeHtml('&')).toBe('&amp;');
    expect(sanitizeHtml('"')).toBe('&quot;');
    expect(sanitizeHtml("'")).toBe('&#x27;');
  });

  it('escapes ampersand first to avoid double-encoding', () => {
    expect(sanitizeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('stripControlChars', () => {
  it('removes 0x00-0x1F except \\t \\n \\r', () => {
    const input = 'a\x00b\x01c\x1Fd\te\nf\rg\x7Fh';
    expect(stripControlChars(input)).toBe('abcd\te\nf\rgh');
  });

  it('returns "" for non-string', () => {
    // @ts-expect-error
    expect(stripControlChars(null)).toBe('');
    // @ts-expect-error
    expect(stripControlChars(undefined)).toBe('');
  });

  it('leaves normal text untouched', () => {
    expect(stripControlChars('hello world')).toBe('hello world');
  });
});
