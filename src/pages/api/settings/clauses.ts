import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportClauses } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.companyId) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  if (locals.user.userType !== 'intermediar' && locals.user.userType !== 'client_direct') {
    return new Response(JSON.stringify({ error: 'Nu ai permisiuni' }), { status: 403 });
  }

  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.body?.trim()) {
      return new Response(JSON.stringify({ error: 'Titlu și conținut obligatorii' }), { status: 400 });
    }

    const id = nanoid();
    await db.insert(transportClauses).values({
      id,
      companyId: locals.user.companyId,
      title: body.title.trim(),
      body: body.body.trim(),
      isDefault: body.isDefault ?? false,
    });

    return new Response(JSON.stringify({ id, success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });
  }

  await db.delete(transportClauses).where(
    and(eq(transportClauses.id, id), eq(transportClauses.companyId, locals.user.companyId))
  );

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
