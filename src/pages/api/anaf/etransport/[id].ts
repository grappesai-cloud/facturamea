// GET /api/anaf/etransport/[id] — refresh the status of one declaration. If the
// row has a spvIndex, calls ANAF (stareMesaj) and updates the stored status.
//
// Guarded: never 500s when ANAF is unconfigured.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { etransportDeclarations } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAnafStatus } from '../../../../lib/anaf/tokens';
import { getStatus } from '../../../../lib/anaf/etransport';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ANAF stareMesaj returns XML with a stare="..." attribute. Map it onto our
// declaration status. "ok" => confirmed, error markers => error, else keep 'sent'.
function mapStare(raw: string): { status: 'sent' | 'confirmed' | 'error'; errorText: string | null } {
  const stare = (raw.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || '').toLowerCase();
  if (/(^|\b)ok\b/.test(stare)) return { status: 'confirmed', errorText: null };
  if (/(nok|eroare|erori|respins|invalid)/.test(stare) || /stare\s*=\s*"[^"]*er/i.test(raw)) {
    const errTxt = raw.match(/(?:errorMessage|mesaj|Erori)[^>]*>?\s*([^<"]{3,200})/i)?.[1]?.trim() || stare || 'Eroare ANAF';
    return { status: 'error', errorText: errTxt };
  }
  return { status: 'sent', errorText: null };
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  const id = params.id as string;
  if (!id) return json({ ok: false, error: 'ID lipsă' }, 400);

  let row: typeof etransportDeclarations.$inferSelect | undefined;
  try {
    [row] = await db.select().from(etransportDeclarations)
      .where(and(eq(etransportDeclarations.id, id), eq(etransportDeclarations.companyId, companyId)))
      .limit(1);
  } catch {
    return json({ ok: false, error: 'Baza de date indisponibilă.' }, 503);
  }
  if (!row) return json({ ok: false, error: 'Declarația nu există' }, 404);

  if (!row.spvIndex) {
    return json({ ok: true, status: row.status, uit: row.uit, note: 'Declarația nu a fost încă trimisă la ANAF.' });
  }

  let anaf: { connected: boolean; cif: string | null };
  try { anaf = await getAnafStatus(companyId); } catch { anaf = { connected: false, cif: null }; }
  if (!anaf.connected) {
    return json({ ok: false, error: 'ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.', status: row.status });
  }

  const res = await getStatus(companyId, row.spvIndex);
  if (!res.ok || !res.raw) {
    return json({ ok: false, error: res.error || 'Nu s-a putut verifica starea.', status: row.status });
  }

  const { status, errorText } = mapStare(res.raw);
  try {
    await db.update(etransportDeclarations).set({ status, errorText }).where(eq(etransportDeclarations.id, row.id));
  } catch { /* best-effort */ }

  return json({ ok: true, status, uit: row.uit, errorText });
};
