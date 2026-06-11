import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { featureFlags } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const key = params.key!;
  const body = await request.json().catch(() => ({}));
  const update: any = { updatedAt: new Date(), updatedBy: locals.user.id };
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  if (typeof body.rolloutPercent === 'number') update.rolloutPercent = Math.max(0, Math.min(100, body.rolloutPercent));
  if (typeof body.description === 'string') update.description = body.description;
  await db.update(featureFlags).set(update).where(eq(featureFlags.key, key));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const key = params.key!;
  await db.delete(featureFlags).where(eq(featureFlags.key, key));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
