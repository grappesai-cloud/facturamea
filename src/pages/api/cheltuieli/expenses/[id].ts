// Expense by id — PATCH (status / paidCents / fields), DELETE.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { expenses } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';

const STATUSES = ['unpaid', 'partial', 'paid'];

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;

  let existing: any = null;
  try {
    [existing] = await db.select().from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.companyId, cid))).limit(1);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare conexiune' }), { status: 500 });
  }
  if (!existing) return new Response(JSON.stringify({ error: 'Cheltuială inexistentă' }), { status: 404 });

  const patch: any = { updatedAt: new Date() };
  const total = Number(existing.totalCents) || 0;

  if (body.paidCents !== undefined) {
    const paid = Math.max(0, Math.round(Number(body.paidCents) || 0));
    patch.paidCents = paid;
    // Auto-derive status from amount paid unless explicitly overridden below.
    patch.status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  }
  if (body.markPaid === true) {
    patch.paidCents = total;
    patch.status = 'paid';
  }
  if (body.status !== undefined && STATUSES.includes(body.status)) {
    patch.status = body.status;
    if (body.status === 'paid' && body.paidCents === undefined) patch.paidCents = total;
    if (body.status === 'unpaid' && body.paidCents === undefined) patch.paidCents = 0;
  }
  if (body.category !== undefined) patch.category = body.category?.trim() || null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.deductible !== undefined) patch.deductible = !!body.deductible;

  try {
    await db.update(expenses).set(patch).where(and(eq(expenses.id, id), eq(expenses.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id;
  if (!id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });

  try {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la ștergere' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
