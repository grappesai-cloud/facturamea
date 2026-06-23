import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { ledgerAccounts } from '../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

const TYPES = ['A', 'P', 'B', 'V', 'C'];

// GET — list the company's chart of accounts (planul de conturi).
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const results = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.companyId, cid))
      .orderBy(asc(ledgerAccounts.code));
    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// POST — add a new ledger account.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const type = String(body.type || 'B').trim().toUpperCase();
  if (!code) return new Response(JSON.stringify({ error: 'Cod obligatoriu' }), { status: 400 });
  if (!name) return new Response(JSON.stringify({ error: 'Nume obligatoriu' }), { status: 400 });
  if (!TYPES.includes(type)) return new Response(JSON.stringify({ error: 'Tip cont invalid' }), { status: 400 });

  try {
    const dup = await db
      .select({ id: ledgerAccounts.id })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.companyId, cid), eq(ledgerAccounts.code, code)))
      .limit(1);
    if (dup.length > 0) return new Response(JSON.stringify({ error: 'Contul există deja.' }), { status: 409 });

    const id = nanoid();
    await db.insert(ledgerAccounts).values({
      id,
      companyId: cid,
      code,
      name,
      type,
      parentCode: body.parentCode ? String(body.parentCode).trim() : null,
      isActive: body.isActive === false ? false : true,
    });
    return new Response(JSON.stringify({ ok: true, id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Eroare' }), { status: 500 });
  }
};

// PATCH — edit a ledger account (name, type, parentCode, isActive).
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const id = String(body.id || '').trim();
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  try {
    const [existing] = await db
      .select()
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.id, id), eq(ledgerAccounts.companyId, cid)));
    if (!existing) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });

    const patch: any = {};
    if (typeof body.name === 'string') patch.name = body.name.trim();
    if (typeof body.type === 'string' && TYPES.includes(body.type.toUpperCase())) patch.type = body.type.toUpperCase();
    if (body.parentCode !== undefined) patch.parentCode = body.parentCode ? String(body.parentCode).trim() : null;
    if (body.isActive !== undefined) patch.isActive = !!body.isActive;
    if (patch.name === '') return new Response(JSON.stringify({ error: 'Nume obligatoriu' }), { status: 400 });

    await db.update(ledgerAccounts).set(patch).where(eq(ledgerAccounts.id, id));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Eroare' }), { status: 500 });
  }
};
