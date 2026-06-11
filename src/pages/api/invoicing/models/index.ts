// CRUD for invoice_models scoped to caller's company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceModels } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  const results = await db.select().from(invoiceModels).where(eq(invoiceModels.companyId, cid));
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'nume obligatoriu' }), { status: 400 });

  const id = nanoid();
  if (body.isDefault) {
    await db.update(invoiceModels).set({ isDefault: false }).where(and(eq(invoiceModels.companyId, cid), eq(invoiceModels.isDefault, true)));
  }
  await db.insert(invoiceModels).values({
    id, companyId: cid,
    name: body.name.trim(),
    layoutKey: body.layoutKey === 'accent' ? 'accent' : 'classic',
    brandColor: body.brandColor || '#0A0A0A',
    logoUrl: body.logoUrl || null,
    footerText: body.footerText || null,
    showQr: !!body.showQr,
    showShipping: body.showShipping !== false,
    showEmittedWith: !!body.showEmittedWith,
    isDefault: !!body.isDefault,
  });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [m] = await db.select().from(invoiceModels).where(and(eq(invoiceModels.id, body.id), eq(invoiceModels.companyId, cid))).limit(1);
  if (!m) return new Response(JSON.stringify({ error: 'inexistent' }), { status: 404 });

  const update: any = {};
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (body.layoutKey === 'classic' || body.layoutKey === 'accent') update.layoutKey = body.layoutKey;
  if (typeof body.brandColor === 'string') update.brandColor = body.brandColor;
  if (typeof body.logoUrl === 'string' || body.logoUrl === null) update.logoUrl = body.logoUrl || null;
  if (typeof body.footerText === 'string' || body.footerText === null) update.footerText = body.footerText || null;
  if (typeof body.showQr === 'boolean') update.showQr = body.showQr;
  if (typeof body.showShipping === 'boolean') update.showShipping = body.showShipping;
  if (typeof body.showEmittedWith === 'boolean') update.showEmittedWith = body.showEmittedWith;
  if (typeof body.isDefault === 'boolean') {
    if (body.isDefault) await db.update(invoiceModels).set({ isDefault: false }).where(and(eq(invoiceModels.companyId, cid), eq(invoiceModels.isDefault, true)));
    update.isDefault = body.isDefault;
  }
  await db.update(invoiceModels).set(update).where(eq(invoiceModels.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });
  await db.delete(invoiceModels).where(and(eq(invoiceModels.id, id), eq(invoiceModels.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
