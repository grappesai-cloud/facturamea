import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';

// Self-service: a user edits their OWN name/phone (row scoped to locals.user.id),
// so no role guard — any authenticated user may update their own profile.
export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  try {
    const body = await request.json();

    await db.update(users).set({
      name: body.name?.trim() || locals.user.name,
      phone: body.phone?.trim() || null,
      updatedAt: new Date(),
    }).where(eq(users.id, locals.user.id));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
};
