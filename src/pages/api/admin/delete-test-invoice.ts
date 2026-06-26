// POST /api/admin/delete-test-invoice { id } — one-shot, admin-only.
// Hard-deletes a SINGLE sandbox test invoice (children cascade via FK).
// Safety: refuses unless the buyer name marks it as a test ("TEST" or "de sters"),
// so it can never remove a real invoice. Remove this file after use.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { transportInvoices } from '../../../db/schema';
import { eq } from 'drizzle-orm';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user as any;
  if (!user?.isAdmin) return json({ error: 'Acces interzis' }, 403);
  const { id } = await request.json().catch(() => ({})) as { id?: string };
  if (!id) return json({ error: 'id lipsă' }, 400);
  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, id));
  if (!inv) return json({ error: 'not found' }, 404);
  const client = (inv as any).clientNameSnap || '';
  if (!/TEST|de sters/i.test(client)) return json({ error: 'refuz: nu pare factură de test', client }, 400);
  await db.delete(transportInvoices).where(eq(transportInvoices.id, id));
  return json({ ok: true, deleted: client });
};
