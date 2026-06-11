import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { notificationPreferences } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const [p] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, locals.user.id));
  return new Response(JSON.stringify(p ?? {
    userId: locals.user.id,
    emailEnabled: true,
    inAppEnabled: true,
    typeOverrides: null,
  }), { headers: { 'Content-Type': 'application/json' } });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const body = await request.json();
  const patch: any = { updatedAt: new Date() };
  if ('emailEnabled' in body) patch.emailEnabled = !!body.emailEnabled;
  if ('inAppEnabled' in body) patch.inAppEnabled = !!body.inAppEnabled;
  if ('typeOverrides' in body) patch.typeOverrides = body.typeOverrides ? JSON.stringify(body.typeOverrides) : null;

  const [existing] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, locals.user.id));
  if (existing) {
    await db.update(notificationPreferences).set(patch).where(eq(notificationPreferences.userId, locals.user.id));
  } else {
    await db.insert(notificationPreferences).values({ userId: locals.user.id, ...patch });
  }
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
