// /api/anaf/etransport
//   GET  — list etransport_declarations for the current company.
//   POST — insert a draft declaration; if ANAF is connected, build the XML and
//          call declareUit (store uit/spvIndex/status='sent' or 'error'); if not
//          connected, keep status='draft' and return a note.
//
// Guarded: never 500s when ANAF is unconfigured.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { etransportDeclarations } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getAnafStatus } from '../../../../lib/anaf/tokens';
import { declareUit, buildEtransportXml, type EtransportXmlInput } from '../../../../lib/anaf/etransport';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  try {
    const rows = await db.select().from(etransportDeclarations)
      .where(eq(etransportDeclarations.companyId, companyId))
      .orderBy(desc(etransportDeclarations.createdAt))
      .limit(200);
    return json({ ok: true, rows });
  } catch {
    return json({ ok: true, rows: [] });
  }
};

interface GoodsLine { name?: string; qty?: number | string; value?: number | string; ncCode?: string; unit?: string; grossWeightKg?: number | string; }

// ANAF codDeclaratie nomenclature is numeric. We accept either a numeric code
// or a friendly label and map common ones; default to intra-EU acquisition.
function operationCode(op: string): number {
  const t = (op || '').trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  switch (t.toUpperCase()) {
    case 'AIC':            // achiziție intracomunitară
    case 'IMPORT': return 10;
    case 'LIC':            // livrare intracomunitară
    case 'EXPORT': return 30;
    case 'INTERN':
    case 'TRANSPORT INTERN': return 40;
    default: return 10;
  }
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Body invalid' }, 400); }

  const operationType = String(body?.operationType || '').trim();
  const senderName = String(body?.senderName || '').trim();
  const recipientName = String(body?.recipientName || '').trim();
  const loadingAddress = String(body?.loadingAddress || '').trim();
  const unloadingAddress = String(body?.unloadingAddress || '').trim();
  const vehiclePlate = String(body?.vehiclePlate || '').trim().toUpperCase();
  const goods: GoodsLine[] = Array.isArray(body?.goods) ? body.goods : [];

  if (!operationType) return json({ ok: false, error: 'Alege tipul operațiunii.' }, 400);
  if (!vehiclePlate) return json({ ok: false, error: 'Completează numărul de înmatriculare.' }, 400);
  if (goods.length === 0) return json({ ok: false, error: 'Adaugă cel puțin un bun transportat.' }, 400);

  // Total value in cents (sum of line values).
  const totalValueCents = goods.reduce((s, g) => s + Math.round(toNum(g.value) * 100), 0);

  const decId = nanoid();
  const baseRow = {
    id: decId,
    companyId,
    uit: null as string | null,
    spvIndex: null as string | null,
    operationType,
    senderName: senderName || null,
    recipientName: recipientName || null,
    loadingAddress: loadingAddress || null,
    unloadingAddress: unloadingAddress || null,
    vehiclePlate,
    goodsJson: JSON.stringify(goods),
    totalValueCents,
    status: 'draft' as 'draft' | 'sent' | 'confirmed' | 'error',
    errorText: null as string | null,
    xml: null as string | null,
    createdByUserId: locals.user.id,
    createdAt: new Date(),
  };

  // Persist the draft first so it is never lost, even if ANAF errors.
  try {
    await db.insert(etransportDeclarations).values(baseRow);
  } catch {
    return json({ ok: false, error: 'Nu s-a putut salva declarația.' }, 502);
  }

  // If ANAF isn't connected, leave it as a draft and tell the user.
  let anaf: { connected: boolean; cif: string | null };
  try { anaf = await getAnafStatus(companyId); } catch { anaf = { connected: false, cif: null }; }
  if (!anaf.connected || !anaf.cif) {
    return json({
      ok: true,
      id: decId,
      status: 'draft',
      note: 'Declarația a fost salvată ca ciornă. Conectează firma la ANAF din Setări → Integrare ANAF pentru a o trimite.',
    });
  }

  // Build the XML and declare the UIT.
  const today = new Date().toISOString().slice(0, 10);
  const xmlInput: EtransportXmlInput = {
    declarant: { cif: anaf.cif, name: senderName || recipientName || 'Declarant' },
    vehicle: { plateNumber: vehiclePlate },
    driver: { firstName: '', lastName: '' },
    loading: { country: 'RO', locality: loadingAddress || '-', street: loadingAddress || '-', date: today },
    unloading: { country: 'RO', locality: unloadingAddress || '-', street: unloadingAddress || '-', date: today },
    goods: goods.map((g) => ({
      nomenclatureCode: String(g.ncCode || '').trim() || '00000000',
      description: String(g.name || '').trim() || 'Bun',
      grossWeightKg: toNum(g.grossWeightKg) || toNum(g.qty),
      quantity: toNum(g.qty) || 1,
      unit: String(g.unit || 'NAR').trim(),
      valueRon: toNum(g.value),
    })),
    operationType: operationCode(operationType),
  };

  let xml: string;
  try { xml = buildEtransportXml(xmlInput); }
  catch (e) {
    const msg = `Date invalide: ${e instanceof Error ? e.message : 'eroare'}`;
    await db.update(etransportDeclarations).set({ status: 'error', errorText: msg }).where(eq(etransportDeclarations.id, decId)).catch(() => {});
    return json({ ok: false, id: decId, error: msg }, 400);
  }

  const result = await declareUit(companyId, { xml, cif: anaf.cif, userId: locals.user.id });

  if (result.ok) {
    await db.update(etransportDeclarations).set({
      uit: result.uit ?? null,
      spvIndex: result.spvIndex ?? null,
      status: 'sent',
      xml,
      errorText: null,
    }).where(eq(etransportDeclarations.id, decId)).catch(() => {});
    return json({ ok: true, id: decId, status: 'sent', uit: result.uit ?? null, spvIndex: result.spvIndex ?? null });
  }

  await db.update(etransportDeclarations).set({
    status: 'error',
    errorText: result.error || 'Eroare la trimiterea către ANAF.',
    xml,
  }).where(eq(etransportDeclarations.id, decId)).catch(() => {});
  return json({ ok: false, id: decId, status: 'error', error: result.error || 'Eroare la trimiterea către ANAF.' });
};
