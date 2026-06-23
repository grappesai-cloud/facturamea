import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceClients } from '../../../../db/schema';
import { and, eq, ilike, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

// External clients managed by an issuing company. Internal companies (i.e.
// already on TH) are queried separately in /api/invoicing/clients/search.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const q = url.searchParams.get('q')?.trim();
  const where = q
    ? and(eq(invoiceClients.ownerCompanyId, cid), or(
        ilike(invoiceClients.name, `%${q}%`),
        ilike(invoiceClients.taxId, `%${q}%`),
      ))!
    : eq(invoiceClients.ownerCompanyId, cid);

  const results = await db.select().from(invoiceClients).where(where).orderBy(desc(invoiceClients.createdAt)).limit(25);
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'invoice.create'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json();
  if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'Nume obligatoriu' }), { status: 400 });

  const id = nanoid();
  await db.insert(invoiceClients).values({
    id,
    ownerCompanyId: cid,
    name: body.name.trim(),
    taxId: body.taxId?.trim() || null,
    isVatPayer: !!body.isVatPayer,
    registryNumber: body.registryNumber?.trim() || null,
    country: body.country?.trim() || 'Romania',
    county: body.county?.trim() || null,
    city: body.city?.trim() || null,
    address: body.address?.trim() || null,
    postalCode: body.postalCode?.trim() || null,
    contactName: body.contactName?.trim() || null,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    iban: body.iban?.trim() || null,
    bank: body.bank?.trim() || null,
    notes: body.notes?.trim() || null,
  });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

const FIELDS = ['name', 'taxId', 'isVatPayer', 'registryNumber', 'country', 'county', 'city', 'address', 'postalCode', 'contactName', 'email', 'phone', 'iban', 'bank', 'notes'] as const;

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'invoice.create'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!body.id) return new Response(JSON.stringify({ error: 'ID lipsă' }), { status: 400 });
  const [existing] = await db.select().from(invoiceClients)
    .where(and(eq(invoiceClients.id, body.id), eq(invoiceClients.ownerCompanyId, cid)));
  if (!existing) return new Response(JSON.stringify({ error: 'Inexistent' }), { status: 404 });

  const patch: any = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    patch[f] = f === 'isVatPayer' ? !!body[f] : (typeof body[f] === 'string' ? body[f].trim() || null : body[f]);
  }
  if (patch.name === null) return new Response(JSON.stringify({ error: 'Nume obligatoriu' }), { status: 400 });
  await db.update(invoiceClients).set(patch).where(eq(invoiceClients.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'invoice.create'); if (denied) return denied; }
  const cid = locals.user.companyId;
  const id = url.searchParams.get('id');
  if (!id || !cid) return new Response(JSON.stringify({ error: 'ID/companie lipsă' }), { status: 400 });
  await db.delete(invoiceClients).where(and(eq(invoiceClients.id, id), eq(invoiceClients.ownerCompanyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
