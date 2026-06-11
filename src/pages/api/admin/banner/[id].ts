import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { siteBanner } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  await db.update(siteBanner).set({ active: false }).where(eq(siteBanner.id, params.id!));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
