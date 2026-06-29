// D112 XML export (declaratieUnica v6). Built from the payroll run + per-employee
// items joined with the employee record (CNP, base salary, dependents, hire date)
// + company + declarant (from the signed-in user). Structure follows the official
// ANAF schema; the file MUST still be validated with DUK Integrator before filing
// (the published standalone XSD is incomplete — DUK has the full schema). See
// lib/d112.ts.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { payrollRuns, payrollItems, employees, companies } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { generateD112Xml, type D112Asigurat } from '../../../../../lib/d112';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = params.id || '';

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, id), eq(payrollRuns.companyId, cid))).limit(1);
  if (!run) return new Response(JSON.stringify({ error: 'Stat de plată inexistent' }), { status: 404 });

  const rows = await db.select({
    cnp: employees.cnp,
    fullName: payrollItems.employeeNameSnap,
    grossCents: payrollItems.grossCents,
    casCents: payrollItems.casCents,
    cassCents: payrollItems.cassCents,
    taxCents: payrollItems.taxCents,
    netCents: payrollItems.netCents,
    camCents: payrollItems.camCents,
    deductionCents: payrollItems.deductionCents,
    baseSalaryCents: employees.baseSalaryCents,
    nrDependents: employees.nrDependents,
    hiredAt: employees.hiredAt,
    employmentType: employees.employmentType,
  })
    .from(payrollItems)
    .leftJoin(employees, eq(employees.id, payrollItems.employeeId))
    .where(eq(payrollItems.runId, id));

  const [company] = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);

  const asigurati: D112Asigurat[] = rows.map((r) => {
    const cas = r.casCents || 0;
    const tax = r.taxCents || 0;
    // Worked (contribution) gross = CAS / 25%; taxable base = impozit / 10%.
    const workedGross = cas > 0 ? cas * 4 : (r.grossCents || 0);
    return {
      cnp: r.cnp,
      fullName: r.fullName || '',
      baseSalaryCents: r.baseSalaryCents ?? (r.grossCents || 0),
      workedGrossCents: workedGross,
      casCents: cas,
      cassCents: r.cassCents || 0,
      taxCents: tax,
      taxableCents: tax * 10,
      netCents: r.netCents || 0,
      camCents: r.camCents || 0,
      deductionCents: r.deductionCents || 0,
      nrDependents: r.nrDependents || 0,
      hiredAt: r.hiredAt ? new Date(r.hiredAt as any).toISOString() : null,
      employmentType: r.employmentType || 'full_time',
    };
  });

  // Declarant from the signed-in user's name.
  const nameParts = (locals.user.name || '').trim().split(/\s+/);
  const declarant = {
    nume: nameParts[0] || company?.name || '-',
    prenume: nameParts.slice(1).join(' ') || '-',
    functie: 'Administrator',
  };

  const { xml } = generateD112Xml({
    year: run.year,
    month: run.month,
    rectificativa: false,
    company: {
      cui: company?.cui ?? null,
      name: company?.name ?? '',
      address: company?.address ?? null,
      city: company?.city ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      caen: (company as any)?.caen ?? null,
      casaAng: (company as any)?.county ?? null,
    },
    declarant,
    asigurati,
  });

  const fname = `D112_${run.year}_${String(run.month).padStart(2, '0')}.xml`;
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
};
