// Employees (angajați) — list active, create, update, delete. Scoped to the caller's company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { employees } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const TYPES = ['full_time', 'part_time'];

function intCents(v: any): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db.select().from(employees)
      .where(and(eq(employees.companyId, cid), eq(employees.active, true)))
      .orderBy(desc(employees.createdAt))
      .limit(500);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const fullName = String(body.fullName || '').trim();
  if (!fullName) return new Response(JSON.stringify({ error: 'Numele angajatului e obligatoriu' }), { status: 400 });

  const employmentType = TYPES.includes(body.employmentType) ? body.employmentType : 'full_time';
  const id = nanoid();
  try {
    await db.insert(employees).values({
      id,
      companyId: cid,
      fullName,
      cnp: body.cnp?.toString().trim() || null,
      position: body.position?.toString().trim() || null,
      baseSalaryCents: intCents(body.baseSalaryCents),
      deductionCents: intCents(body.deductionCents),
      employmentType,
      iban: body.iban?.toString().trim() || null,
      hiredAt: body.hiredAt?.toString().trim() || null,
      active: true,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const id = String(body.id || '').trim();
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [emp] = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, cid))).limit(1);
  if (!emp) return new Response(JSON.stringify({ error: 'Angajat inexistent' }), { status: 404 });

  const patch: any = {};
  if (body.fullName !== undefined) {
    const fn = String(body.fullName || '').trim();
    if (!fn) return new Response(JSON.stringify({ error: 'Numele angajatului e obligatoriu' }), { status: 400 });
    patch.fullName = fn;
  }
  if (body.cnp !== undefined) patch.cnp = body.cnp?.toString().trim() || null;
  if (body.position !== undefined) patch.position = body.position?.toString().trim() || null;
  if (body.baseSalaryCents !== undefined) patch.baseSalaryCents = intCents(body.baseSalaryCents);
  if (body.deductionCents !== undefined) patch.deductionCents = intCents(body.deductionCents);
  if (body.employmentType !== undefined) patch.employmentType = TYPES.includes(body.employmentType) ? body.employmentType : 'full_time';
  if (body.iban !== undefined) patch.iban = body.iban?.toString().trim() || null;
  if (body.hiredAt !== undefined) patch.hiredAt = body.hiredAt?.toString().trim() || null;
  if (body.active !== undefined) patch.active = !!body.active;

  try {
    await db.update(employees).set(patch).where(and(eq(employees.id, id), eq(employees.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la actualizare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

// DELETE /api/salarii/employees?id=... — soft-delete (active=false) so historical
// payroll items keep referencing the employee.
export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [emp] = await db.select({ id: employees.id }).from(employees)
    .where(and(eq(employees.id, id), eq(employees.companyId, cid))).limit(1);
  if (!emp) return new Response(JSON.stringify({ error: 'Angajat inexistent' }), { status: 404 });

  await db.update(employees).set({ active: false }).where(and(eq(employees.id, id), eq(employees.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
