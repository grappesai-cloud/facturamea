// Single fixed asset — read, dispose (PATCH), delete.
// GET    -> { asset, entries }
// PATCH  -> { ok } ; body { dispose: true, disposedAt? } scrap/sale,
//           or general field edits (name, category, inventoryNumber, method, usefulLifeMonths)
// DELETE -> { ok } (cascade removes depreciation entries via FK)

import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { fixedAssets, depreciationEntries } from '../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';

import { requireRole } from '../../../lib/require-role';
const METHODS = ['liniara', 'degresiva', 'accelerata'];

async function loadOwned(cid: string, id: string) {
  const [asset] = await db.select().from(fixedAssets)
    .where(and(eq(fixedAssets.id, id), eq(fixedAssets.companyId, cid)))
    .limit(1);
  return asset || null;
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id!;

  try {
    const asset = await loadOwned(cid, id);
    if (!asset) return new Response(JSON.stringify({ error: 'Mijloc fix inexistent' }), { status: 404 });
    const entries = await db.select().from(depreciationEntries)
      .where(eq(depreciationEntries.assetId, id))
      .orderBy(desc(depreciationEntries.period));
    return new Response(JSON.stringify({ asset, entries }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la încărcare' }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id!;
  const body = await request.json().catch(() => ({})) as any;

  try {
    const asset = await loadOwned(cid, id);
    if (!asset) return new Response(JSON.stringify({ error: 'Mijloc fix inexistent' }), { status: 404 });

    const patch: any = {};
    if (body.dispose === true) {
      patch.status = 'disposed';
      patch.disposedAt = body.disposedAt || new Date().toISOString().slice(0, 10);
    }
    if (body.reactivate === true) {
      patch.status = 'active';
      patch.disposedAt = null;
    }
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.inventoryNumber !== undefined) patch.inventoryNumber = body.inventoryNumber?.trim() || null;
    if (body.category !== undefined) patch.category = body.category?.trim() || null;
    if (body.acquisitionDate !== undefined) patch.acquisitionDate = body.acquisitionDate || null;
    if (body.method !== undefined && METHODS.includes(body.method)) patch.method = body.method;
    if (body.usefulLifeMonths !== undefined) patch.usefulLifeMonths = Math.max(1, Math.round(Number(body.usefulLifeMonths) || 1));

    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ error: 'Nimic de actualizat' }), { status: 400 });
    }

    await db.update(fixedAssets).set(patch).where(eq(fixedAssets.id, id));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id!;

  try {
    const asset = await loadOwned(cid, id);
    if (!asset) return new Response(JSON.stringify({ error: 'Mijloc fix inexistent' }), { status: 404 });
    await db.delete(fixedAssets).where(and(eq(fixedAssets.id, id), eq(fixedAssets.companyId, cid)));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
};
