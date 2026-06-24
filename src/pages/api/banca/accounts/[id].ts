import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { bankAccounts } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';

import { requireRole } from '../../../../lib/require-role';
const PATCH_FIELDS = ['name', 'iban', 'bank', 'currency', 'isActive'] as const;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const patch: Record<string, unknown> = {};
  for (const f of PATCH_FIELDS) {
    if (body[f] === undefined) continue;
    if (f === 'isActive') patch.isActive = !!body.isActive;
    else if (f === 'iban') patch.iban = body.iban ? String(body.iban).replace(/\s+/g, '').slice(0, 40) : null;
    else if (f === 'currency') patch.currency = (String(body.currency).trim().toUpperCase() || 'RON').slice(0, 5);
    else if (f === 'name') {
      const n = String(body.name ?? '').trim();
      if (!n) return new Response(JSON.stringify({ error: 'Numele contului este obligatoriu' }), { status: 400 });
      patch.name = n.slice(0, 120);
    } else if (f === 'bank') patch.bank = body.bank ? String(body.bank).trim().slice(0, 80) : null;
  }
  if (Object.keys(patch).length === 0) return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const [existing] = await db.select({ id: bankAccounts.id }).from(bankAccounts)
      .where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, cid)));
    if (!existing) return new Response(JSON.stringify({ error: 'Cont inexistent' }), { status: 404 });
    await db.update(bankAccounts).set(patch).where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, cid)));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  const id = params.id;
  if (!cid || !id) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });

  try {
    // Transactions cascade-delete via the FK (onDelete: 'cascade').
    await db.delete(bankAccounts).where(and(eq(bankAccounts.id, id), eq(bankAccounts.companyId, cid)));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
};
