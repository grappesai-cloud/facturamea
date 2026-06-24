// POST /api/invoicing/invoices/[id]/efactura-status — re-checks the SPV
// processing status of an already-submitted invoice and updates
// transport_invoices.efacturaStatus to 'validated' or 'rejected' when ANAF
// returns a final state.
//
// Guarded: never 500s when ANAF is unconfigured or the invoice has no anafId.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAnafStatus } from '../../../../../lib/anaf/tokens';
import { getSubmissionStatus } from '../../../../../lib/anaf/efactura-client';

import { requireRole } from '../../../../../lib/require-role';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ANAF e-Factura stareMesaj returns XML with stare="ok" (validated, includes an
// id_descarcare for the signed XML), stare="nok" (rejected), or
// stare="in prelucrare" (still processing).
function mapStare(raw: string): { status: 'validated' | 'rejected' | null; error: string | null } {
  const stare = (raw.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || '').toLowerCase();
  if (stare === 'ok') return { status: 'validated', error: null };
  if (stare === 'nok') {
    const err = raw.match(/(?:errorMessage|Erori|mesaj)[^>]*>?\s*([^<"]{3,300})/i)?.[1]?.trim()
      || 'Factura a fost respinsă de ANAF.';
    return { status: 'rejected', error: err };
  }
  return { status: null, error: null }; // in prelucrare / unknown — leave as is
}

export const POST: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  const invoiceId = params.id as string;
  if (!invoiceId) return json({ ok: false, error: 'ID lipsă' }, 400);

  let inv: typeof transportInvoices.$inferSelect | undefined;
  try {
    [inv] = await db.select().from(transportInvoices)
      .where(eq(transportInvoices.id, invoiceId)).limit(1);
  } catch {
    return json({ ok: false, error: 'Baza de date indisponibilă.' }, 503);
  }
  if (!inv) return json({ ok: false, error: 'Factura nu există' }, 404);
  if (inv.companyId !== companyId) return json({ ok: false, error: 'Fără acces' }, 403);

  if (!inv.efacturaAnafId) {
    return json({ ok: false, error: 'Factura nu are un index de încărcare ANAF. Trimite-o întâi la SPV.', status: inv.efacturaStatus });
  }

  let anaf: { connected: boolean; cif: string | null };
  try { anaf = await getAnafStatus(companyId); } catch { anaf = { connected: false, cif: null }; }
  if (!anaf.connected) {
    return json({ ok: false, error: 'ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.', status: inv.efacturaStatus });
  }

  const res = await getSubmissionStatus(companyId, inv.efacturaAnafId);
  if (!res.ok || !res.raw) {
    return json({ ok: false, error: res.error || 'Nu s-a putut verifica starea la ANAF.', status: inv.efacturaStatus });
  }

  const { status, error } = mapStare(res.raw);
  if (!status) {
    // Still processing at ANAF — keep the current status, report back.
    return json({ ok: true, status: inv.efacturaStatus, processing: true });
  }

  try {
    await db.update(transportInvoices).set({
      efacturaStatus: status,
      efacturaError: status === 'rejected' ? error : null,
      updatedAt: new Date(),
    }).where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, companyId)));
  } catch { /* best-effort */ }

  return json({ ok: true, status, error });
};
