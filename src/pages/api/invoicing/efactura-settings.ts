// GET/POST the company's e-Factura auto-send preference.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  const cid = locals.user?.companyId;
  if (!cid) return new Response(JSON.stringify({ autoSend: false }), { headers: { 'Content-Type': 'application/json' } });
  try {
    const [co] = await db.select({ auto: companies.efacturaAutoSend }).from(companies).where(eq(companies.id, cid)).limit(1);
    return new Response(JSON.stringify({ autoSend: !!co?.auto }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ autoSend: false }), { headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const cid = locals.user?.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  // Owner / admin only (operators shouldn't flip fiscal automation).
  const role = (locals.company as any)?.role || 'owner';
  if (!locals.user?.isAdmin && role !== 'owner' && role !== 'accountant') {
    return new Response(JSON.stringify({ error: 'Doar administratorul poate schimba acest setaj' }), { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const autoSend = !!body.autoSend;
  await db.update(companies).set({ efacturaAutoSend: autoSend }).where(eq(companies.id, cid));
  return new Response(JSON.stringify({ ok: true, autoSend }), { headers: { 'Content-Type': 'application/json' } });
};
