// Official D112 XML export. Built from the payroll run + per-employee items (with
// CNP from the employees table) + the company declarant data. Must be validated
// with ANAF DUK Integrator before filing (see lib/d112.ts).
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

  // Items joined with the employee for the CNP (not snapshotted on the item).
  const rows = await db.select({
    cnp: employees.cnp,
    fullName: payrollItems.employeeNameSnap,
    grossCents: payrollItems.grossCents,
    casCents: payrollItems.casCents,
    cassCents: payrollItems.cassCents,
    taxCents: payrollItems.taxCents,
  })
    .from(payrollItems)
    .leftJoin(employees, eq(employees.id, payrollItems.employeeId))
    .where(eq(payrollItems.runId, id));

  const [company] = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);

  const asigurati: D112Asigurat[] = rows.map((r) => ({
    cnp: r.cnp,
    fullName: r.fullName || '',
    grossCents: r.grossCents || 0,
    casCents: r.casCents || 0,
    cassCents: r.cassCents || 0,
    taxCents: r.taxCents || 0,
  }));

  const xml = generateD112Xml({
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
    },
    asigurati,
    totalCasCents: run.totalCasCents || 0,
    totalCassCents: run.totalCassCents || 0,
    totalTaxCents: run.totalTaxCents || 0,
    totalCamCents: run.totalCamCents || 0,
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
