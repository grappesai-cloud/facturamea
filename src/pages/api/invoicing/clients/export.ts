// CSV export of a company's external invoice clients.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceClients } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.companyId) return new Response('unauthorized', { status: 401 });
  const rows = await db.select().from(invoiceClients)
    .where(eq(invoiceClients.ownerCompanyId, locals.user.companyId))
    .orderBy(desc(invoiceClients.createdAt)).limit(5000);

  const header = ['name', 'taxId', 'isVatPayer', 'registryNumber', 'country', 'county', 'city', 'address', 'email', 'phone', 'iban', 'bank', 'contactName'];
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [header.join(',')].concat(rows.map((r: any) => header.map((h) => esc(r[h])).join(','))).join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="clienti-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
