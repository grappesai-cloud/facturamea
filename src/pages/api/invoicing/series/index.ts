// CRUD for invoice_series scoped to the caller's company. POST creates,
// PATCH updates, DELETE removes (allowed only when no invoices use the series).
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoiceSeries, transportInvoices } from '../../../../db/schema';
import { and, eq, sql, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';

const VALID_KINDS = ['factura', 'proforma', 'storno', 'chitanta', 'comanda'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  const results = await db.select().from(invoiceSeries).where(eq(invoiceSeries.companyId, cid));
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (!VALID_KINDS.includes(body.kind)) return new Response(JSON.stringify({ error: 'kind invalid' }), { status: 400 });
  if (!body.prefix?.trim()) return new Response(JSON.stringify({ error: 'prefix obligatoriu' }), { status: 400 });
  if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'nume obligatoriu' }), { status: 400 });
  if (body.nextNumber !== undefined && (!Number.isFinite(Number(body.nextNumber)) || Number(body.nextNumber) < 1)) {
    return new Response(JSON.stringify({ error: 'Numărul de start trebuie să fie cel puțin 1' }), { status: 400 });
  }

  const id = nanoid();
  const isDefault = !!body.isDefault;

  // If this becomes default, demote the existing default for the same
  // kind + scope (platform / external / both stay independent).
  const newScope = body.scope || null;
  if (isDefault) {
    await db.update(invoiceSeries)
      .set({ isDefault: false })
      .where(and(
        eq(invoiceSeries.companyId, cid), eq(invoiceSeries.kind, body.kind), eq(invoiceSeries.isDefault, true),
        newScope === null ? isNull(invoiceSeries.scope) : eq(invoiceSeries.scope, newScope),
      ));
  }

  await db.insert(invoiceSeries).values({
    id,
    companyId: cid,
    name: body.name.trim(),
    prefix: body.prefix.trim().toUpperCase().slice(0, 16),
    kind: body.kind,
    nextNumber: body.nextNumber && Number(body.nextNumber) > 0 ? Math.round(Number(body.nextNumber)) : 1,
    isDefault,
    scope: body.scope || null,
  });
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const body = await request.json().catch(() => ({}));
  if (!body.id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [existing] = await db.select().from(invoiceSeries).where(and(eq(invoiceSeries.id, body.id), eq(invoiceSeries.companyId, cid))).limit(1);
  if (!existing) return new Response(JSON.stringify({ error: 'inexistent' }), { status: 404 });

  const update: any = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.prefix === 'string' && body.prefix.trim()) update.prefix = body.prefix.trim().toUpperCase().slice(0, 16);
  if (typeof body.scope === 'string' || body.scope === null) update.scope = body.scope || null;
  if (typeof body.nextNumber === 'number') {
    const requested = Math.round(body.nextNumber);
    if (requested < 1) return new Response(JSON.stringify({ error: 'Numărul de start trebuie să fie cel puțin 1' }), { status: 400 });
    // Reject any nextNumber that would reuse an already-issued legal number.
    const [maxRow] = await db
      .select({ m: sql<number>`COALESCE(MAX(${transportInvoices.sequenceNumber}), 0)` })
      .from(transportInvoices)
      .where(eq(transportInvoices.seriesId, body.id));
    const issuedMax = Number(maxRow?.m ?? 0);
    if (requested <= issuedMax) {
      return new Response(JSON.stringify({ error: `Numărul ${requested} ar reutiliza un număr deja emis (maxim emis: ${issuedMax}). Folosește cel puțin ${issuedMax + 1}.` }), { status: 400 });
    }
    update.nextNumber = requested;
  }
  if (typeof body.isDefault === 'boolean') {
    if (body.isDefault) {
      // Demote the current default for this kind + scope only.
      const effScope = (typeof body.scope === 'string' || body.scope === null) ? (body.scope || null) : (existing.scope || null);
      await db.update(invoiceSeries)
        .set({ isDefault: false })
        .where(and(
          eq(invoiceSeries.companyId, cid), eq(invoiceSeries.kind, existing.kind), eq(invoiceSeries.isDefault, true),
          effScope === null ? isNull(invoiceSeries.scope) : eq(invoiceSeries.scope, effScope),
        ));
    }
    update.isDefault = body.isDefault;
  }

  await db.update(invoiceSeries).set(update).where(eq(invoiceSeries.id, body.id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [usedRow] = await db.select({ count: sql<number>`COUNT(*)` }).from(transportInvoices).where(eq(transportInvoices.seriesId, id));
  if ((usedRow?.count ?? 0) > 0) {
    return new Response(JSON.stringify({ error: 'Seria are facturi emise — nu poate fi ștearsă' }), { status: 409 });
  }

  await db.delete(invoiceSeries).where(and(eq(invoiceSeries.id, id), eq(invoiceSeries.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
