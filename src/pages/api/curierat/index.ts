import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { shipments } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_PROVIDERS = ['sameday', 'fan', 'dpd', 'cargus'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ results: [] });

  try {
    const results = await db
      .select()
      .from(shipments)
      .where(eq(shipments.companyId, cid))
      .orderBy(desc(shipments.createdAt))
      .limit(150);
    return json({ results });
  } catch {
    return json({ results: [] });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);

  try {
    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').toLowerCase().trim();
    if (!VALID_PROVIDERS.includes(provider)) return json({ error: 'Curier invalid' }, 400);

    const recipientName = String(body?.recipientName || '').trim().slice(0, 200);
    if (!recipientName) return json({ error: 'Numele destinatarului este obligatoriu' }, 400);

    const parcels = Math.max(1, Math.round(Number(body?.parcels) || 1));
    const weightKg = Number.isFinite(Number(body?.weightKg)) ? Number(body.weightKg) : null;
    // Ramburs (COD) is sent from the UI in RON (major units) → store as cents.
    const codRon = Number(body?.codRon);
    const codCents = Number.isFinite(codRon) && codRon > 0 ? Math.round(codRon * 100) : 0;

    const id = nanoid();
    await db.insert(shipments).values({
      id,
      companyId: cid,
      provider,
      awb: null,
      invoiceId: String(body?.invoiceId || '').trim() || null,
      recipientName,
      recipientPhone: String(body?.recipientPhone || '').trim().slice(0, 40) || null,
      address: String(body?.address || '').trim() || null,
      city: String(body?.city || '').trim().slice(0, 120) || null,
      county: String(body?.county || '').trim().slice(0, 80) || null,
      parcels,
      weightKg,
      codCents,
      status: 'draft',
      labelUrl: null,
      createdByUserId: locals.user.id,
    });

    return json(
      {
        id,
        status: 'draft',
        // Scaffold note: real AWB generation needs the courier account API key.
        note: 'Expedierea a fost salvată ca ciornă. Generarea AWB-ului real necesită conectarea contului de curier (cheie API).',
      },
      201,
    );
  } catch {
    return json({ error: 'Eroare la salvare' }, 500);
  }
};
