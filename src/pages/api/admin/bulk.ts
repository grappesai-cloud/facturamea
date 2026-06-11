import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { incidents, newsArticles } from '../../../db/schema';
import { inArray } from 'drizzle-orm';
import { logAction } from '../../../lib/audit';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403 });
  }
  const body = await request.json();
  const { entity, action, ids } = body as { entity: string; action: string; ids: string[] };

  if (!entity || !action || !Array.isArray(ids) || ids.length === 0) {
    return new Response(JSON.stringify({ error: 'Date incomplete' }), { status: 400 });
  }
  if (ids.length > 200) {
    return new Response(JSON.stringify({ error: 'Maxim 200 elemente per acțiune' }), { status: 400 });
  }

  let affected = 0;

  if (entity === 'incidents') {
    if (action === 'approve_public') {
      const r = await db.update(incidents).set({ isPublic: true, updatedAt: new Date(), adminReviewedBy: locals.user.id, adminReviewedAt: new Date() }).where(inArray(incidents.id, ids));
      affected = ids.length;
    } else if (action === 'unpublish') {
      await db.update(incidents).set({ isPublic: false, updatedAt: new Date(), adminReviewedBy: locals.user.id, adminReviewedAt: new Date() }).where(inArray(incidents.id, ids));
      affected = ids.length;
    } else if (action === 'resolve') {
      await db.update(incidents).set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date(), adminReviewedBy: locals.user.id, adminReviewedAt: new Date() }).where(inArray(incidents.id, ids));
      affected = ids.length;
    } else if (action === 'reject') {
      await db.update(incidents).set({ status: 'rejected', updatedAt: new Date(), adminReviewedBy: locals.user.id, adminReviewedAt: new Date() }).where(inArray(incidents.id, ids));
      affected = ids.length;
    } else {
      return new Response(JSON.stringify({ error: 'Acțiune necunoscută' }), { status: 400 });
    }
  } else if (entity === 'news') {
    if (action === 'publish') {
      await db.update(newsArticles).set({ isPublished: true, publishedAt: new Date(), updatedAt: new Date() }).where(inArray(newsArticles.id, ids));
      affected = ids.length;
    } else if (action === 'unpublish') {
      await db.update(newsArticles).set({ isPublished: false, updatedAt: new Date() }).where(inArray(newsArticles.id, ids));
      affected = ids.length;
    } else if (action === 'delete') {
      await db.delete(newsArticles).where(inArray(newsArticles.id, ids));
      affected = ids.length;
    } else {
      return new Response(JSON.stringify({ error: 'Acțiune necunoscută' }), { status: 400 });
    }
  } else {
    return new Response(JSON.stringify({ error: 'Entitate necunoscută' }), { status: 400 });
  }

  await logAction({
    userId: locals.user.id,
    companyId: locals.user.companyId,
    action: 'admin.action',
    entityType: entity,
    metadata: { bulkAction: action, ids, count: affected },
    request,
  });

  return new Response(JSON.stringify({ success: true, affected }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
