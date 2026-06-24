// Fixed assets (mijloace fixe) — list + create, scoped to the caller's company.
// GET  -> { results: FixedAsset[] }
// POST -> { id }   (creates a new active asset)

import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { fixedAssets } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../lib/require-role';

const METHODS = ['liniara', 'degresiva', 'accelerata'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db.select().from(fixedAssets)
      .where(eq(fixedAssets.companyId, cid))
      .orderBy(desc(fixedAssets.createdAt))
      .limit(500);
  } catch { /* DB not provisioned */ }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'expense.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const name = String(body.name || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Numele e obligatoriu' }), { status: 400 });

  const valueCents = Math.max(0, Math.round(Number(body.valueCents) || 0));
  if (valueCents <= 0) return new Response(JSON.stringify({ error: 'Valoarea trebuie să fie mai mare ca 0' }), { status: 400 });

  const usefulLifeMonths = Math.max(1, Math.round(Number(body.usefulLifeMonths) || 12));
  const method = METHODS.includes(body.method) ? body.method : 'liniara';

  const id = nanoid();
  try {
    await db.insert(fixedAssets).values({
      id,
      companyId: cid,
      name,
      inventoryNumber: body.inventoryNumber?.trim() || null,
      category: body.category?.trim() || null,
      acquisitionDate: body.acquisitionDate || null,
      valueCents,
      usefulLifeMonths,
      method,
      accumulatedCents: 0,
      status: 'active',
    } as any);
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Nu s-a putut salva mijlocul fix.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
