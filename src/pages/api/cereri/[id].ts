// PATCH /api/cereri/[id]
//   { responseNote?, responseAttachmentUrl?, responseAttachmentName? } → the
//     client responds; the requester is notified.
//   { resolve: true } → mark the request done.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { clientRequests } from '../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { notify } from '../../../lib/notifications';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return json({ error: 'Date lipsă' }, 400);

  const [req] = await db.select().from(clientRequests)
    .where(and(eq(clientRequests.id, id), eq(clientRequests.companyId, cid))).limit(1);
  if (!req) return json({ error: 'Cerere inexistentă' }, 404);

  const body = await request.json().catch(() => ({})) as any;

  if (body.resolve === true) {
    try {
      await db.update(clientRequests).set({ status: 'resolved', resolvedByUserId: locals.user.id, resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(clientRequests.id, id));
    } catch { return json({ error: 'Nu am putut închide cererea.' }, 500); }
    return json({ ok: true });
  }

  // Otherwise it's a response (text and/or an uploaded file).
  const responseNote = body.responseNote?.trim() || null;
  const responseAttachmentUrl = body.responseAttachmentUrl?.trim() || null;
  if (!responseNote && !responseAttachmentUrl) return json({ error: 'Adaugă un mesaj sau un fișier.' }, 400);

  try {
    await db.update(clientRequests).set({
      responseNote, responseAttachmentUrl,
      responseAttachmentName: body.responseAttachmentName?.trim() || null,
      respondedByUserId: locals.user.id, respondedAt: new Date(), updatedAt: new Date(),
    }).where(eq(clientRequests.id, id));
  } catch { return json({ error: 'Nu am putut salva răspunsul.' }, 500); }

  // Notify the requester (the accountant) that the client answered.
  if (req.createdByUserId && req.createdByUserId !== locals.user.id) {
    await notify({ userId: req.createdByUserId, type: 'client_request', title: 'Răspuns la cererea ta', body: req.title, linkUrl: '/app/cereri' }).catch(() => {});
  }
  return json({ ok: true });
};
