import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock the db module before importing auth.ts (which imports from '../db').
const deleteCalls: any[] = [];
const whereCalls: any[] = [];

vi.mock('../src/db', () => {
  return {
    db: {
      delete: vi.fn((table: any) => {
        deleteCalls.push(table);
        return {
          where: vi.fn((cond: any) => {
            whereCalls.push(cond);
            return Promise.resolve();
          }),
        };
      }),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      })),
    },
  };
});

// Mock schema module to avoid pulling in Drizzle pg metadata.
vi.mock('../src/db/schema', () => ({
  users: { id: 'users.id', email: 'users.email' },
  sessions: { id: 'sessions.id', userId: 'sessions.userId' },
  companies: { id: 'companies.id' },
}));

vi.mock('drizzle-orm', () => ({ eq: (a: any, b: any) => ({ a, b }) }));

vi.mock('../src/lib/platform-id', () => ({
  generatePlatformId: vi.fn(async () => 'TH-10001'),
}));

import {
  hashPassword,
  verifyPassword,
  verifyAndMaybeRehash,
  revokeAllSessionsForUser,
} from '../src/lib/auth';

describe('hashPassword', () => {
  it('produces a bcrypt $2-prefixed string', async () => {
    const h = await hashPassword('p@ssw0rd');
    expect(h.startsWith('$2')).toBe(true);
    expect(h.length).toBeGreaterThan(50);
  });

  it('produces cost-12 hashes verifiable by verifyPassword', async () => {
    const h = await hashPassword('hello-world');
    expect(/^\$2[aby]\$12\$/.test(h)).toBe(true);
    expect(await verifyPassword('hello-world', h)).toBe(true);
    expect(await verifyPassword('not-it', h)).toBe(false);
  });
});

describe('verifyAndMaybeRehash', () => {
  it('returns valid + newHash when input was cost<12', async () => {
    const lowCost = await bcrypt.hash('secret', 10);
    expect(/^\$2[aby]\$10\$/.test(lowCost)).toBe(true);
    const r = await verifyAndMaybeRehash('secret', lowCost);
    expect(r.valid).toBe(true);
    expect(r.newHash).toBeTruthy();
    expect(/^\$2[aby]\$12\$/.test(r.newHash!)).toBe(true);
  });

  it('returns valid only (no rehash) when cost===12', async () => {
    const h = await bcrypt.hash('secret', 12);
    const r = await verifyAndMaybeRehash('secret', h);
    expect(r.valid).toBe(true);
    expect(r.newHash).toBeUndefined();
  });

  it('returns invalid on wrong password', async () => {
    const h = await bcrypt.hash('secret', 12);
    const r = await verifyAndMaybeRehash('wrong', h);
    expect(r.valid).toBe(false);
    expect(r.newHash).toBeUndefined();
  });
});

describe('revokeAllSessionsForUser', () => {
  beforeEach(() => {
    deleteCalls.length = 0;
    whereCalls.length = 0;
  });

  it('calls db.delete on sessions table', async () => {
    await revokeAllSessionsForUser('user-123');
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0]).toMatchObject({ id: 'sessions.id' });
    expect(whereCalls.length).toBe(1);
  });
});
