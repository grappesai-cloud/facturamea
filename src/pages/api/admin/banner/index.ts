import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { siteBanner } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.message) return new Response(JSON.stringify({ error: 'message obligatoriu' }), { status: 400 });
  // Deactivate any active banner first
  try { await db.update(siteBanner).set({ active: false }).where(eq(siteBanner.active, true)); } catch {}
  await db.insert(siteBanner).values({
    id: nanoid(),
    message: body.message,
    severity: body.severity || 'info',
    active: true,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    createdBy: locals.user.id,
  } as any);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
