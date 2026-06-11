import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { allocateFounderNumber } from '../../../lib/platform-id';

export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403 });
  }

  try {
    const { userId, action } = await request.json();

    if (action === 'deactivate') {
      await db.update(users).set({ isActive: false }).where(eq(users.id, userId));
    } else if (action === 'activate') {
      await db.update(users).set({ isActive: true }).where(eq(users.id, userId));
    } else if (action === 'make-admin') {
      await db.update(users).set({ isAdmin: true, userType: 'admin' }).where(eq(users.id, userId));
    } else if (action === 'remove-admin') {
      await db.update(users).set({ isAdmin: false }).where(eq(users.id, userId));
    } else if (action === 'promote-founder') {
      // Allocate the next free founder slot (1..999) and update the user.
      // No-op if already a founder.
      const [existing] = await db.select({ isFounder: users.isFounder }).from(users).where(eq(users.id, userId));
      if (existing && !existing.isFounder) {
        const { founderNumber, platformId } = await allocateFounderNumber();
        await db.update(users).set({ isFounder: true, founderNumber, platformId }).where(eq(users.id, userId));
        return new Response(JSON.stringify({ success: true, founderNumber, platformId }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else if (action === 'revoke-founder') {
      await db.update(users).set({ isFounder: false }).where(eq(users.id, userId));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('admin/users action failed:', err);
    return new Response(JSON.stringify({ error: 'Eroare internă' }), { status: 500 });
  }
};
