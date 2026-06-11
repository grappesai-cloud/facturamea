import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq, and, isNull } from 'drizzle-orm';

// POST /api/users/onboarding-dismiss
// Mark the welcome tour as seen for the current user. Idempotent: only writes when
// onboarding_seen_at is NULL, so re-dismissing doesn't shift the original timestamp.
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  await db.update(users)
    .set({ onboardingSeenAt: new Date() })
    .where(and(eq(users.id, locals.user.id), isNull(users.onboardingSeenAt)));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
