// Payroll runs (state de plată) — list + compute a run for {year, month}.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { employees, payrollRuns, payrollItems } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { computePayroll } from '../../../../lib/payroll';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  let results: any[] = [];
  try {
    results = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.companyId, cid))
      .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
      .limit(200);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

// POST { year, month } — compute the payroll run. Loads active employees, runs the
// RO payroll engine per employee, upserts a draft run + its items, snapshots totals.
// A finalized run is read-only; an existing draft has its items replaced.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const year = Math.round(Number(body.year));
  const month = Math.round(Number(body.month));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return new Response(JSON.stringify({ error: 'An invalid' }), { status: 400 });
  if (!Number.isFinite(month) || month < 1 || month > 12) return new Response(JSON.stringify({ error: 'Lună invalidă' }), { status: 400 });

  // Existing run for this period?
  const [existing] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.companyId, cid), eq(payrollRuns.year, year), eq(payrollRuns.month, month))).limit(1);
  if (existing && existing.status === 'finalized') {
    return new Response(JSON.stringify({ error: 'Statul de plată e finalizat și nu mai poate fi recalculat.' }), { status: 422 });
  }

  // Active employees.
  const emps = await db.select().from(employees)
    .where(and(eq(employees.companyId, cid), eq(employees.active, true)))
    .limit(500);

  const items = emps.map((e: any) => {
    const b = computePayroll(e.baseSalaryCents || 0, e.deductionCents || 0);
    return {
      employeeId: e.id as string,
      employeeNameSnap: e.fullName as string,
      grossCents: b.grossCents,
      casCents: b.casCents,
      cassCents: b.cassCents,
      deductionCents: b.deductionCents,
      taxCents: b.taxCents,
      netCents: b.netCents,
      camCents: b.camCents,
    };
  });

  const totals = items.reduce((t, i) => ({
    totalGrossCents: t.totalGrossCents + i.grossCents,
    totalNetCents: t.totalNetCents + i.netCents,
    totalCasCents: t.totalCasCents + i.casCents,
    totalCassCents: t.totalCassCents + i.cassCents,
    totalTaxCents: t.totalTaxCents + i.taxCents,
    totalCamCents: t.totalCamCents + i.camCents,
  }), { totalGrossCents: 0, totalNetCents: 0, totalCasCents: 0, totalCassCents: 0, totalTaxCents: 0, totalCamCents: 0 });

  let runId = existing?.id as string | undefined;
  try {
    if (existing) {
      runId = existing.id;
      // Replace the draft's items.
      await db.delete(payrollItems).where(eq(payrollItems.runId, runId));
      await db.update(payrollRuns).set({ status: 'draft', ...totals }).where(eq(payrollRuns.id, runId));
    } else {
      runId = nanoid();
      await db.insert(payrollRuns).values({
        id: runId,
        companyId: cid,
        year,
        month,
        status: 'draft',
        ...totals,
      } as any);
    }
    if (items.length) {
      await db.insert(payrollItems).values(items.map((i) => ({
        id: nanoid(),
        runId: runId!,
        companyId: cid,
        ...i,
      })) as any);
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la calcularea statului de plată' }), { status: 500 });
  }

  return new Response(JSON.stringify({ id: runId, count: items.length, ...totals }), {
    status: existing ? 200 : 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
