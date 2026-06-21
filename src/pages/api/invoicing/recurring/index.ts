// /api/invoicing/recurring — CRUD for recurring invoice schedules.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceRecurring } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }));

  const results = await db.select().from(invoiceRecurring)
    .where(eq(invoiceRecurring.companyId, cid))
    .orderBy(desc(invoiceRecurring.createdAt));
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

const FREQ = new Set(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'Nume lipsă' }), { status: 400 });
  if (!FREQ.has(body.frequency)) return new Response(JSON.stringify({ error: 'Frecvență invalidă' }), { status: 400 });
  if (!body.startAt || !/^\d{4}-\d{2}-\d{2}$/.test(body.startAt)) return new Response(JSON.stringify({ error: 'Start invalid' }), { status: 400 });
  if (!Array.isArray(body.lines) || body.lines.length === 0) return new Response(JSON.stringify({ error: 'Linii lipsă' }), { status: 400 });

  const id = nanoid();
  await db.insert(invoiceRecurring).values({
    id, companyId: cid,
    clientCompanyId: body.clientCompanyId || null,
    clientExternalId: body.clientExternalId || null,
    name: String(body.name).trim(),
    frequency: body.frequency,
    startAt: body.startAt,
    endAt: body.endAt || null,
    nextRunAt: body.nextRunAt || body.startAt,
    seriesId: body.seriesId || null,
    currency: (body.currency || 'RON').toUpperCase().slice(0, 5),
    vatRegime: body.vatRegime || 'standard',
    linesJson: JSON.stringify(body.lines),
    paymentTermDays: body.paymentTermDays != null ? Number(body.paymentTermDays) : 30,
    sendEmail: body.sendEmail !== false,
    recipientEmail: body.recipientEmail?.trim() || null,
    notes: body.notes?.trim() || null,
    maxRuns: body.maxRuns != null ? Number(body.maxRuns) : null,
    createdByUserId: locals.user.id,
  } as any);
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });
  const [existing] = await db.select().from(invoiceRecurring)
    .where(and(eq(invoiceRecurring.id, body.id), eq(invoiceRecurring.companyId, cid)));
  if (!existing) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });

  const patch: any = { updatedAt: new Date() };
  if (body.isActive !== undefined) patch.isActive = !!body.isActive;
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.frequency !== undefined && FREQ.has(body.frequency)) patch.frequency = body.frequency;
  if (body.nextRunAt !== undefined) patch.nextRunAt = body.nextRunAt;
  if (body.endAt !== undefined) patch.endAt = body.endAt || null;
  if (body.lines !== undefined) patch.linesJson = JSON.stringify(body.lines);
  if (body.paymentTermDays !== undefined) patch.paymentTermDays = Number(body.paymentTermDays);
  if (body.recipientEmail !== undefined) patch.recipientEmail = body.recipientEmail?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  await db.update(invoiceRecurring).set(patch).where(eq(invoiceRecurring.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  const id = url.searchParams.get('id');
  if (!id || !cid) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });
  await db.update(invoiceRecurring).set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(invoiceRecurring.id, id), eq(invoiceRecurring.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
