import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @upstash/redis ────────────────────────────────────
// We capture all method calls so we can assert INCR/EXPIRE/TTL behavior.

interface MockState {
  counts: Map<string, number>;
  ttls: Map<string, number>;
  incrCalls: string[];
  expireCalls: Array<[string, number]>;
  ttlCalls: string[];
}

const state: MockState = {
  counts: new Map(),
  ttls: new Map(),
  incrCalls: [],
  expireCalls: [],
  ttlCalls: [],
};

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      constructor(_opts: any) {}
      async incr(key: string) {
        state.incrCalls.push(key);
        const next = (state.counts.get(key) ?? 0) + 1;
        state.counts.set(key, next);
        return next;
      }
      async expire(key: string, seconds: number) {
        state.expireCalls.push([key, seconds]);
        state.ttls.set(key, seconds);
        return 1;
      }
      async ttl(key: string) {
        state.ttlCalls.push(key);
        return state.ttls.get(key) ?? -1;
      }
      async get(_k: string) {
        return null;
      }
      async set() {
        return 'OK';
      }
      async del() {
        return 1;
      }
    },
  };
});

describe('rateLimitAsync (Upstash path)', () => {
  beforeEach(() => {
    state.counts.clear();
    state.ttls.clear();
    state.incrCalls.length = 0;
    state.expireCalls.length = 0;
    state.ttlCalls.length = 0;
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it('calls INCR + EXPIRE on first request, only INCR after', async () => {
    const { rateLimitAsync } = await import('../src/lib/security');
    const key = 'user-1';

    const r1 = await rateLimitAsync(key, 5, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(4);
    expect(state.incrCalls).toEqual([`rl:${key}`]);
    expect(state.expireCalls).toEqual([[`rl:${key}`, 60]]); // 60s from 60_000ms

    const r2 = await rateLimitAsync(key, 5, 60_000);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(3);
    // Only one EXPIRE total (set when count === 1)
    expect(state.expireCalls.length).toBe(1);
    expect(state.incrCalls.length).toBe(2);
  });

  it('blocks once count exceeds maxRequests', async () => {
    const { rateLimitAsync } = await import('../src/lib/security');
    const key = 'user-block';

    for (let i = 0; i < 3; i++) await rateLimitAsync(key, 3, 30_000);
    const blocked = await rateLimitAsync(key, 3, 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('queries TTL on every call', async () => {
    const { rateLimitAsync } = await import('../src/lib/security');
    await rateLimitAsync('tk', 5, 10_000);
    await rateLimitAsync('tk', 5, 10_000);
    expect(state.ttlCalls.length).toBe(2);
  });

  it('falls back to in-memory when Upstash env not set', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.resetModules();
    const { rateLimitAsync } = await import('../src/lib/security');
    const r = await rateLimitAsync(`fallback-${Math.random()}`, 2, 5000);
    expect(r.allowed).toBe(true);
    // No upstash calls were made
    expect(state.incrCalls.length).toBe(0);
  });
});
