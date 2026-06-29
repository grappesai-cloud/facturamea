// Edit a single payroll item — set concediu medical (days + cod) and recompute
// that item + the run totals. Draft runs only.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { payrollItems, payrollRuns, employees } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { computePayroll } from '../../../../lib/payroll';

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const itemId = params.id || '';
  const body = await request.json().catch(() => ({}));
  const cmDays = Math.max(0, Math.round(Number(body.cmDays) || 0));
  const cmCode = body.cmCode ? String(body.cmCode).slice(0, 4) : null;

  const [item] = await db.select().from(payrollItems)
    .where(and(eq(payrollItems.id, itemId), eq(payrollItems.companyId, cid))).limit(1);
  if (!item) return new Response(JSON.stringify({ error: 'Linie inexistentă' }), { status: 404 });

  const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, item.runId)).limit(1);
  if (!run) return new Response(JSON.stringify({ error: 'Stat inexistent' }), { status: 404 });
  if (run.status === 'finalized') return new Response(JSON.stringify({ error: 'Stat finalizat — nu se mai modifică' }), { status: 400 });

  const [emp] = await db.select().from(employees).where(eq(employees.id, item.employeeId)).limit(1);
  const base = emp?.baseSalaryCents ?? item.grossCents;

  const b = computePayroll(base, {
    nrDependents: emp?.nrDependents || 0,
    deductionCents: emp?.deductionCents || 0,
    cmDays,
    cmCode,
  });

  await db.update(payrollItems).set({
    grossCents: b.grossCents,
    casCents: b.casCents,
    cassCents: b.cassCents,
    deductionCents: b.deductionCents,
    taxCents: b.taxCents,
    netCents: b.netCents,
    camCents: b.camCents,
    cmDays: b.cm.days,
    cmCode: b.cm.code,
    cmIndemnizationCents: b.cm.indemnizationCents,
    cmFnuassCents: b.cm.fnuassCents,
  }).where(eq(payrollItems.id, itemId));

  // Recompute run totals from all items.
  const all = await db.select().from(payrollItems).where(eq(payrollItems.runId, run.id));
  const t = all.reduce((a, i: any) => ({
    totalGrossCents: a.totalGrossCents + (i.grossCents || 0),
    totalNetCents: a.totalNetCents + (i.netCents || 0),
    totalCasCents: a.totalCasCents + (i.casCents || 0),
    totalCassCents: a.totalCassCents + (i.cassCents || 0),
    totalTaxCents: a.totalTaxCents + (i.taxCents || 0),
    totalCamCents: a.totalCamCents + (i.camCents || 0),
  }), { totalGrossCents: 0, totalNetCents: 0, totalCasCents: 0, totalCassCents: 0, totalTaxCents: 0, totalCamCents: 0 });
  await db.update(payrollRuns).set(t).where(eq(payrollRuns.id, run.id));

  return new Response(JSON.stringify({ ok: true, item: { id: itemId, cmDays: b.cm.days, cmCode: b.cm.code, cmIndemnizationCents: b.cm.indemnizationCents, netCents: b.netCents } }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
