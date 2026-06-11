import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  validateBody,
  freightCreateSchema,
  loginSchema,
  waitlistSignupSchema,
} from '../src/lib/validation';

function jsonReq(body: unknown): Request {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function rawReq(raw: string): Request {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}

describe('validateBody', () => {
  const schema = z.object({ name: z.string().min(2), age: z.number().int() });

  it('returns ok+data on valid input', async () => {
    const r = await validateBody(jsonReq({ name: 'Ana', age: 30 }), schema);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe('Ana');
      expect(r.data.age).toBe(30);
    }
  });

  it('returns 400 + field errors on schema fail', async () => {
    const r = await validateBody(jsonReq({ name: 'A', age: 'x' }), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toBe('Date invalide');
      expect(body.fields).toBeTruthy();
      expect(typeof body.fields.name).toBe('string');
      expect(typeof body.fields.age).toBe('string');
    }
  });

  it('returns 400 on invalid JSON', async () => {
    const r = await validateBody(rawReq('{not json'), schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toBe('JSON invalid');
    }
  });
});

describe('freightCreateSchema', () => {
  it('accepts a minimal valid payload', () => {
    const r = freightCreateSchema.safeParse({
      loadingCityName: 'București',
      loadingCountry: 'RO',
      unloadingCityName: 'Cluj-Napoca',
      unloadingCountry: 'RO',
      loadingDate: '2026-06-01',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing required loadingCityName', () => {
    const r = freightCreateSchema.safeParse({
      loadingCountry: 'RO',
      unloadingCityName: 'Cluj',
      unloadingCountry: 'RO',
      loadingDate: '2026-06-01',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty loadingDate', () => {
    const r = freightCreateSchema.safeParse({
      loadingCityName: 'Buc',
      loadingCountry: 'RO',
      unloadingCityName: 'Cluj',
      unloadingCountry: 'RO',
      loadingDate: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts a valid login', () => {
    const r = loginSchema.safeParse({ email: 'a@b.co', password: 'hunter2' });
    expect(r.success).toBe(true);
  });

  it('rejects malformed email', () => {
    const r = loginSchema.safeParse({ email: 'not-an-email', password: 'hunter2' });
    expect(r.success).toBe(false);
  });

  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ email: 'a@b.co', password: '' });
    expect(r.success).toBe(false);
  });
});

describe('waitlistSignupSchema (literal true checkboxes)', () => {
  const base = {
    name: 'Ion Popescu',
    email: 'ion@example.ro',
    companyType: 'transportator' as const,
  };

  it('requires acceptedTc === true (literal)', () => {
    const r = waitlistSignupSchema.safeParse({
      ...base,
      acceptedTc: false,
      acceptedGdpr: true,
    });
    expect(r.success).toBe(false);
  });

  it('requires acceptedGdpr === true (literal)', () => {
    const r = waitlistSignupSchema.safeParse({
      ...base,
      acceptedTc: true,
      acceptedGdpr: false,
    });
    expect(r.success).toBe(false);
  });

  it('accepts both as literal true', () => {
    const r = waitlistSignupSchema.safeParse({
      ...base,
      acceptedTc: true,
      acceptedGdpr: true,
    });
    expect(r.success).toBe(true);
  });
});
