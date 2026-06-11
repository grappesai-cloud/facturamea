import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { featureFlags } from '../../../../db/schema';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!body.key || typeof body.key !== 'string') return new Response(JSON.stringify({ error: 'key obligatoriu' }), { status: 400 });
  try {
    await db.insert(featureFlags).values({
      key: body.key.trim(),
      enabled: !!body.enabled,
      rolloutPercent: Math.max(0, Math.min(100, parseInt(body.rolloutPercent ?? 100, 10))),
      description: body.description ?? null,
      updatedBy: locals.user.id,
      updatedAt: new Date(),
    } as any).onConflictDoNothing();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Insert failed' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
