// GET  /api/cereri        — list document/info requests for the active company.
// POST /api/cereri         — create a request and notify the other team members
//                            (the client) so they know something is needed.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { clientRequests, users, userCompanyMemberships } from '../../../db/schema';
import { and, eq, desc, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { notify } from '../../../lib/notifications';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const RELATED = ['invoice', 'expense', 'bank'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ results: [] });
  try {
    const creator = users;
    const results = await db.select({
      id: clientRequests.id,
      title: clientRequests.title,
      note: clientRequests.note,
      relatedType: clientRequests.relatedType,
      relatedId: clientRequests.relatedId,
      status: clientRequests.status,
      responseNote: clientRequests.responseNote,
      responseAttachmentUrl: clientRequests.responseAttachmentUrl,
      responseAttachmentName: clientRequests.responseAttachmentName,
      respondedAt: clientRequests.respondedAt,
      resolvedAt: clientRequests.resolvedAt,
      createdAt: clientRequests.createdAt,
      createdByName: creator.name,
    }).from(clientRequests)
      .leftJoin(creator, eq(creator.id, clientRequests.createdByUserId))
      .where(eq(clientRequests.companyId, cid))
      .orderBy(desc(clientRequests.createdAt))
      .limit(300);
    return json({ results });
  } catch {
    return json({ results: [] });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);

  const body = await request.json().catch(() => ({})) as any;
  const title = String(body.title || '').trim();
  if (!title) return json({ error: 'Spune ce ai nevoie (titlul cererii).' }, 400);
  const relatedType = RELATED.includes(body.relatedType) ? body.relatedType : null;

  const id = nanoid();
  try {
    await db.insert(clientRequests).values({
      id, companyId: cid, createdByUserId: locals.user.id,
      title, note: body.note?.trim() || null,
      relatedType, relatedId: body.relatedId ? String(body.relatedId) : null,
      status: 'open',
    } as any);
  } catch {
    return json({ error: 'Nu am putut salva cererea.' }, 500);
  }

  // Notify every OTHER member of the company (the client side).
  try {
    const members = await db.select({ userId: userCompanyMemberships.userId })
      .from(userCompanyMemberships)
      .where(and(eq(userCompanyMemberships.companyId, cid), ne(userCompanyMemberships.userId, locals.user.id)));
    for (const m of members) {
      await notify({ userId: m.userId, type: 'client_request', title: 'Cerere nouă de documente', body: title, linkUrl: '/app/cereri' }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return json({ id }, 201);
};
