import { describe, expect, it } from 'vitest';
import { incidentCreateSchema, freightBidCreateSchema, messageCreateSchema } from '../src/lib/validation';

describe('incidentCreateSchema', () => {
  it('accepts a valid incident', () => {
    const r = incidentCreateSchema.safeParse({
      againstCompanyId: 'abc',
      category: 'payment_delay',
      title: 'Întârziere plată',
      body: 'Pasibil de luarea în considerare.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown category', () => {
    const r = incidentCreateSchema.safeParse({
      againstCompanyId: 'abc',
      category: 'something_else',
      title: 'Test',
      body: 'Lorem ipsum dolor.',
    });
    expect(r.success).toBe(false);
  });

  it('rejects too-short body', () => {
    const r = incidentCreateSchema.safeParse({
      againstCompanyId: 'abc',
      category: 'fraud',
      title: 'Test',
      body: 'short',
    });
    expect(r.success).toBe(false);
  });
});

describe('freightBidCreateSchema', () => {
  it('accepts valid bid', () => {
    const r = freightBidCreateSchema.safeParse({ freightId: 'f1', amount: 1500, currency: 'EUR' });
    expect(r.success).toBe(true);
  });

  it('rejects negative amount', () => {
    const r = freightBidCreateSchema.safeParse({ freightId: 'f1', amount: -10, currency: 'EUR' });
    expect(r.success).toBe(false);
  });
});

describe('messageCreateSchema', () => {
  it('requires recipient', () => {
    const r = messageCreateSchema.safeParse({ body: 'Hi' });
    expect(r.success).toBe(false);
  });

  it('accepts with conversationId', () => {
    const r = messageCreateSchema.safeParse({ conversationId: 'c1', body: 'Hi' });
    expect(r.success).toBe(true);
  });
});
