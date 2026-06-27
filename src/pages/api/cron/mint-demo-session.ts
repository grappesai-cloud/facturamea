// One-shot: mint a session token for a given account so the store-screenshot
// Puppeteer run can load the real /app at phone size with real demo data.
// Guarded by CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { createSession } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, url }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return new Response(JSON.stringify({ error: 'email lipsă' }), { status: 400 });
  try {
    const [u] = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(eq(users.email, email)).limit(1);
    if (!u) return new Response(JSON.stringify({ error: 'user inexistent' }), { status: 404 });
    const token = await createSession(u.id);
    return new Response(JSON.stringify({ ok: true, token, userId: u.id, companyId: u.companyId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'failed' }), { status: 500 });
  }
};
