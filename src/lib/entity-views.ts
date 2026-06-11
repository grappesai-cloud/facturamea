// Track unique viewers per entity. Server-side helper called din paginile
// detail (auction/freight/truck/classified). Idempotent prin unique-index — re-views
// doar bump view_count + last_viewed_at.

import { db } from '../db';
import { entityViews, auctions, freight, availableTrucks, classifieds } from './../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type EntityKind = 'auction' | 'freight' | 'truck' | 'classified';

/** Record a view from `viewerUserId` on the given entity. Skip if user is the
 *  poster/owner — owners viewing their own item shouldn't inflate stats. */
export async function recordView(
  entityType: EntityKind,
  entityId: string,
  viewerUserId: string,
  viewerCompanyId: string | null,
  ownerUserId: string | null,
): Promise<void> {
  if (ownerUserId && ownerUserId === viewerUserId) return;
  try {
    await db.insert(entityViews).values({
      id: nanoid(),
      entityType, entityId, viewerUserId, viewerCompanyId,
    } as any).onConflictDoUpdate({
      target: [entityViews.entityType, entityViews.entityId, entityViews.viewerUserId],
      set: {
        viewCount: sql`${entityViews.viewCount} + 1`,
        lastViewedAt: new Date(),
      },
    });
  } catch (err) {
    // Non-blocking — view tracking failures shouldn't break detail pages
    console.error('recordView failed:', err);
  }
}

/** Verifică dacă userul curent e ownerul entităţii. Doar ownerul vede lista de
 *  viewers (privacy: nu vrei să-i arăţi unui competitor că tu i-ai văzut anunţul). */
export async function isEntityOwner(
  entityType: EntityKind,
  entityId: string,
  userId: string,
): Promise<boolean> {
  try {
    if (entityType === 'auction') {
      const [r] = await db.select({ p: auctions.postedBy }).from(auctions).where(eq(auctions.id, entityId));
      return r?.p === userId;
    }
    if (entityType === 'freight') {
      const [r] = await db.select({ p: freight.postedBy }).from(freight).where(eq(freight.id, entityId));
      return r?.p === userId;
    }
    if (entityType === 'truck') {
      const [r] = await db.select({ p: availableTrucks.postedBy }).from(availableTrucks).where(eq(availableTrucks.id, entityId));
      return r?.p === userId;
    }
    if (entityType === 'classified') {
      const [r] = await db.select({ p: classifieds.userId }).from(classifieds).where(eq(classifieds.id, entityId));
      return r?.p === userId;
    }
  } catch {}
  return false;
}
