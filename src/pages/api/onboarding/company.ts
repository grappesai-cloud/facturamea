import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies, billingAddresses } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sanitizeHtml } from '../../../lib/security';

// Best-effort locality extraction from an ANAF address string, e.g.
// "JUD. BUZĂU, MUN. BUZĂU, STR. PATRIEI, NR.2" -> "BUZĂU".
function parseCity(addr: string): string {
  if (!addr) return '';
  const m = addr.match(/(?:MUNICIPIUL|MUN\.?|ORAŞUL|ORASUL|ORAŞUL|ORAŞ|ORAS|COMUNA|COM\.?|SAT)\s+([A-Za-zĂÂÎȘȚăâîșţş][A-Za-zĂÂÎȘȚăâîșţş.\- ]+?)(?:\s*,|\s+SECTOR|\s+STR\.|\s+NR\.|$)/i);
  if (m) return m[1].trim().replace(/\s+/g, ' ');
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  return parts[0] || '';
}

// Saves the company fiscal profile during onboarding. Everything is pulled from
// ANAF on the client (CIF lookup); here we persist it to `companies` and seed a
// default `billing_addresses` row (legal name + reg. com.) so invoices carry
// the full issuer identity. CIF + address are required to pass the gate.
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
  const regCom = String(body.regCom || '').trim();
  const phone = String(body.phone || '').trim();
  const country = (String(body.country || 'Romania').trim() || 'Romania');

  if (!cui) return new Response(JSON.stringify({ error: 'CIF-ul este obligatoriu.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!name || !address) return new Response(JSON.stringify({ error: 'Preia datele de la ANAF (denumire + adresă) înainte de a continua.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const city = parseCity(address);

  try {
    await db.update(companies).set({
      cui: cui.slice(0, 50),
      name: sanitizeHtml(name).slice(0, 500),
      address: sanitizeHtml(address),
      city: city ? sanitizeHtml(city).slice(0, 200) : undefined,
      country: country.slice(0, 100),
      phone: phone ? phone.slice(0, 50) : undefined,
    } as any).where(eq(companies.id, user.companyId));
  } catch {
    return new Response(JSON.stringify({ error: 'Nu am putut salva datele firmei.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Seed / update the default invoice issuer profile with reg. com. — best-effort.
  try {
    const [existing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, user.companyId));
    const values = {
      legalName: sanitizeHtml(name).slice(0, 300),
      cui: cui.slice(0, 50),
      regCom: regCom ? regCom.slice(0, 50) : null,
      address: sanitizeHtml(address),
      city: (city || name).slice(0, 200),
      countryCode: 'RO',
      isDefault: true,
    };
    if (existing) {
      await db.update(billingAddresses).set(values as any).where(eq(billingAddresses.id, existing.id));
    } else {
      await db.insert(billingAddresses).values({ id: nanoid(), companyId: user.companyId, ...values } as any);
    }
  } catch { /* invoice profile is best-effort; company save already succeeded */ }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
