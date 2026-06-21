import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { sanitizeHtml } from '../../../lib/security';

// Saves the company fiscal profile during onboarding. The account owner edits
// their own company; CIF + address + city are required to pass the activation
// gate (see middleware). No new table — writes straight to `companies`.
export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.companyId) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Date invalide' }), { status: 400 }); }

  const cui = String(body.cui || '').trim();
  const name = String(body.name || '').trim();
  const address = String(body.address || '').trim();
  const city = String(body.city || '').trim();

  if (!cui) return new Response(JSON.stringify({ error: 'CIF-ul este obligatoriu.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!name) return new Response(JSON.stringify({ error: 'Denumirea firmei este obligatorie.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!address) return new Response(JSON.stringify({ error: 'Adresa este obligatorie.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!city) return new Response(JSON.stringify({ error: 'Orașul este obligatoriu.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await db.update(companies).set({
      cui: cui.slice(0, 50),
      name: sanitizeHtml(name).slice(0, 500),
      address: sanitizeHtml(address),
      city: sanitizeHtml(city).slice(0, 200),
      country: (String(body.country || 'Romania').trim() || 'Romania').slice(0, 100),
      phone: body.phone ? String(body.phone).trim().slice(0, 50) : undefined,
      email: body.email ? String(body.email).trim().slice(0, 255) : undefined,
    } as any).where(eq(companies.id, user.companyId));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Nu am putut salva datele firmei.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
