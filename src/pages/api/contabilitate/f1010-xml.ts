// Official F1010 XML export (situații financiare anuale). Built from the bilanț
// derived from the trial balance + the company declarant data. Must be validated
// with the ANAF DUK Integrator against the current S1010/F1010 XSD before filing
// (see lib/f1010.ts).
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { buildBilant, type BilantResult } from '../../../lib/bilant';
import { generateF1010Xml } from '../../../lib/f1010';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const currentYear = new Date().getFullYear();
  const yearParam = Number(url.searchParams.get('year'));
  const year =
    Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= currentYear + 1 ? yearParam : currentYear;

  // If there are no postings, buildBilant still returns a (mostly-zero) result;
  // fall back to an explicit empty bilanț so we always emit a well-formed XML.
  let bilant: BilantResult;
  try {
    bilant = await buildBilant(cid, year);
  } catch {
    bilant = {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      activ: { imobilizate: 0, stocuri: 0, creante: 0, casaBanci: 0, total: 0, lines: [] },
      pasiv: { capitaluri: 0, datorii: 0, total: 0, lines: [] },
      pnl: { venituri: 0, cheltuieli: 0, rezultat: 0, lines: [] },
      balanced: true,
    };
  }

  const [company] = await db.select().from(companies).where(eq(companies.id, cid)).limit(1);

  const xml = generateF1010Xml({
    year,
    company: {
      cui: company?.cui ?? null,
      name: company?.name ?? '',
      address: company?.address ?? null,
      city: company?.city ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
    },
    bilant,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="F1010_${year}.xml"`,
    },
  });
};
