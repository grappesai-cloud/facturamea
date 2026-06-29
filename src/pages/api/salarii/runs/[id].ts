// A single payroll run (stat de plată) — fetch, finalize, delete (draft only).
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { payrollRuns, payrollItems } from '../../../../db/schema';
import { and, eq, asc } from 'drizzle-orm';

async function loadRun(cid: string, id: string) {
  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid))).limit(1);
  return run || null;
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id || '';

  const run = await loadRun(cid, id);
  if (!run) return new Response(JSON.stringify({ error: 'Stat de plată inexistent' }), { status: 404 });
  const items = await db.select().from(payrollItems)
    .where(eq(payrollItems.runId, id)).orderBy(asc(payrollItems.employeeNameSnap));
  return new Response(JSON.stringify({ run, items }), { headers: { 'Content-Type': 'application/json' } });
};

// PATCH — finalize the run (status='finalized', finalizedAt=now).
export const PATCH: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id || '';

  const run = await loadRun(cid, id);
  if (!run) return new Response(JSON.stringify({ error: 'Stat de plată inexistent' }), { status: 404 });
  if (run.status === 'finalized') return new Response(JSON.stringify({ ok: true, alreadyFinalized: true }), { headers: { 'Content-Type': 'application/json' } });

  await db.update(payrollRuns).set({ status: 'finalized', finalizedAt: new Date() })
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

// DELETE — only a draft run can be removed (items cascade).
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id || '';

  const run = await loadRun(cid, id);
  if (!run) return new Response(JSON.stringify({ error: 'Stat de plată inexistent' }), { status: 404 });
  if (run.status === 'finalized') return new Response(JSON.stringify({ error: 'Statul de plată e finalizat și nu poate fi șters.' }), { status: 422 });

  await db.delete(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
