// /api/invoicing/tva — CRUD for the per-company VAT-rate catalogue ("Cote TVA").
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceTvaRates } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ensureTvaRates } from '../../../../lib/tva';
import { requireRole } from '../../../../lib/require-role';

const VALID_REGIMES = new Set([
  'standard', 'reverse_charge', 'exempt', 'tva_la_incasare', 'export_extra_eu', 'intra_eu',
]);

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  const results = await ensureTvaRates(cid);
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'Nume cotă obligatoriu' }), { status: 400 });
  const percent = Math.max(0, Number(body.percent) || 0);
  const regime = VALID_REGIMES.has(body.regime) ? body.regime : 'standard';

  const id = nanoid();
  // New default demotes any previous default.
  if (body.isDefault) {
    await db.update(invoiceTvaRates).set({ isDefault: false }).where(eq(invoiceTvaRates.companyId, cid));
  }
  await db.insert(invoiceTvaRates).values({
    id, companyId: cid,
    name: String(body.name).trim(),
    percent, regime,
    description: body.description?.trim() || null,
    isDefault: !!body.isDefault,
    position: Number(body.position) || 0,
    isActive: body.isActive !== false,
  });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });
  const [existing] = await db.select().from(invoiceTvaRates)
    .where(and(eq(invoiceTvaRates.id, body.id), eq(invoiceTvaRates.companyId, cid)));
  if (!existing) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });

  if (body.isDefault === true) {
    await db.update(invoiceTvaRates).set({ isDefault: false }).where(eq(invoiceTvaRates.companyId, cid));
  }
  const patch: any = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.percent !== undefined) patch.percent = Math.max(0, Number(body.percent) || 0);
  if (body.regime !== undefined && VALID_REGIMES.has(body.regime)) patch.regime = body.regime;
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.isDefault !== undefined) patch.isDefault = !!body.isDefault;
  if (body.isActive !== undefined) patch.isActive = !!body.isActive;
  if (body.position !== undefined) patch.position = Number(body.position) || 0;

  await db.update(invoiceTvaRates).set(patch).where(eq(invoiceTvaRates.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  const id = url.searchParams.get('id');
  if (!id || !cid) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });
  await db.delete(invoiceTvaRates).where(and(eq(invoiceTvaRates.id, id), eq(invoiceTvaRates.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
