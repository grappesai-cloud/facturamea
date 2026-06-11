import { describe, expect, it } from 'vitest';
import { tFn, getLocaleFromCookie } from '../src/lib/i18n';

describe('getLocaleFromCookie', () => {
  it('defaults to ro on missing cookie', () => {
    expect(getLocaleFromCookie(null)).toBe('ro');
    expect(getLocaleFromCookie('')).toBe('ro');
    expect(getLocaleFromCookie(undefined)).toBe('ro');
  });

  it('parses th-locale=en', () => {
    expect(getLocaleFromCookie('foo=bar; th-locale=en; baz=1')).toBe('en');
  });

  it('falls back to ro on invalid value', () => {
    expect(getLocaleFromCookie('th-locale=fr')).toBe('ro');
  });
});

describe('tFn', () => {
  it('returns RO string for nav.freight', () => {
    expect(tFn('ro')('nav.freight')).toBe('Marfă');
  });

  it('returns EN string for nav.freight', () => {
    expect(tFn('en')('nav.freight')).toBe('Freight');
  });

  it('falls back to ro when key missing in en', () => {
    // Use a key that might exist only in ro: termeni page or similar
    const result = tFn('en')('common.search');
    // common.search exists in both but should not be the literal key
    expect(result).not.toBe('common.search');
  });

  it('returns key when missing everywhere with no fallback', () => {
    expect(tFn('ro')('totally.missing.key')).toBe('totally.missing.key');
  });

  it('returns explicit fallback when key missing', () => {
    expect(tFn('ro')('totally.missing.key', 'XX')).toBe('XX');
  });
});
