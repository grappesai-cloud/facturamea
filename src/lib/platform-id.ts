import { db } from '../db';
import { users } from '../db/schema';
import { sql, eq, max } from 'drizzle-orm';

/**
 * Public platform ID for users (facturamea). Two parallel ranges:
 *   - Founders (early adopters / lifetime founders): FM-001 .. FM-999
 *   - Regular users: FM-10000 ascending (skipping the founder range entirely)
 */
const REGULAR_START = 10000;

export async function generatePlatformId(): Promise<string> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(eq(users.isFounder, false));
  const count = Number(result[0]?.count ?? 0);
  const nextId = REGULAR_START + count;
  return `FM-${nextId}`;
}

/**
 * Allocate the next free founder slot (1..999). Throws when sold out.
 */
export async function allocateFounderNumber(): Promise<{ founderNumber: number; platformId: string }> {
  const row = await db.select({ max: max(users.founderNumber) }).from(users);
  const current = Number(row[0]?.max ?? 0);
  const next = current + 1;
  if (next > 999) throw new Error('Founder slots exhausted (max 999).');
  return { founderNumber: next, platformId: `FM-${String(next).padStart(3, '0')}` };
}
