// TEMP debug — post the storno invoice directly and return the real error. DELETE after.
import type { APIRoute } from 'astro';
import { db, transportInvoices, users } from '../../../db';
import { and, eq } from 'drizzle-orm';
import { postInvoice } from '../../../lib/accounting';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.email, 'test.tva@facturamea.test')).limit(1);
  const cid = u?.companyId as string;
  const stornos = await db.select().from(transportInvoices).where(and(eq(transportInvoices.companyId, cid), eq(transportInvoices.kind, 'storno')));
  const out: any[] = [];
  for (const s of stornos) {
    const res = await postInvoice(s.id);
    out.push({ nr: s.fullNumber, subtotalCents: s.subtotalCents, vatCents: s.vatCents, totalCents: s.totalCents, issuedAt: s.issuedAt, result: res });
  }
  return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
