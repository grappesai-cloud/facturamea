// Suppliers (furnizori) — list + create, scoped to the caller's company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { suppliers } from '../../../../db/schema';
import { and, eq, ilike, or, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const q = url.searchParams.get('q')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(suppliers.companyId, cid)];
    if (q) conds.push(or(ilike(suppliers.name, `%${q}%`), ilike(suppliers.cui, `%${q}%`))!);
    results = await db.select().from(suppliers)
      .where(and(...conds))
      .orderBy(desc(suppliers.createdAt))
      .limit(200);
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
  const name = String(body.name || '').trim();
  if (!name) return new Response(JSON.stringify({ error: 'Numele furnizorului e obligatoriu' }), { status: 400 });

  const id = nanoid();
  try {
    await db.insert(suppliers).values({
      id,
      companyId: cid,
      name,
      cui: body.cui?.trim() || null,
      regCom: body.regCom?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      country: body.country?.trim() || 'Romania',
      iban: body.iban?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      isActive: body.isActive !== false,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
