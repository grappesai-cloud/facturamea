// POST /api/invoicing/invoices/[id]/share   → create (or return) a public link
// DELETE /api/invoicing/invoices/[id]/share → revoke the public link
// The token grants read-only access to a single document at /factura/<token>.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { requireRole } from '../../../../../lib/require-role';
function baseUrl() {
  return process.env.PUBLIC_BASE_URL || 'https://facturamea.com';
}

export const POST: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices)
    .where(and(eq(transportInvoices.id, params.id!), eq(transportInvoices.companyId, cid)))
    .limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });

  let token = inv.shareToken;
  if (!token) {
    token = nanoid(32);
    await db.update(transportInvoices).set({ shareToken: token, updatedAt: new Date() }).where(eq(transportInvoices.id, inv.id));
  }
  return new Response(JSON.stringify({ token, url: `${baseUrl()}/factura/${token}` }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  await db.update(transportInvoices).set({ shareToken: null, updatedAt: new Date() })
    .where(and(eq(transportInvoices.id, params.id!), eq(transportInvoices.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
