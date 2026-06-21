import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';

// One-time admin bootstrap. Guarded by CRON_SECRET (no admin exists yet to use
// the in-app "make admin" button). Promotes an existing user to admin by email.
//   GET /api/cron/make-admin?secret=<CRON_SECRET>&email=<email>
export const GET: APIRoute = async ({ url }) => {
  const secret = url.searchParams.get('secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return new Response('email required', { status: 400 });

  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) {
    return new Response(JSON.stringify({ ok: false, error: 'user not found — log in once first', email }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  await db.update(users).set({ isAdmin: true, userType: 'admin', emailVerified: true } as any).where(eq(users.id, u.id));
  return new Response(JSON.stringify({ ok: true, email, userId: u.id }), { headers: { 'Content-Type': 'application/json' } });
};
