// POST /api/invoicing/invoices/[id]/efactura-status — re-checks the SPV
// processing status of an already-submitted invoice and updates
// transport_invoices.efacturaStatus to 'validated' or 'rejected'.
//
// On rejection we now DOWNLOAD the ANAF response (id_descarcare) and unzip it to
// surface the real validation messages instead of an opaque code — otherwise the
// user can't tell why ANAF refused the invoice.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { unzipSync } from 'fflate';
import { getAnafStatus } from '../../../../../lib/anaf/tokens';
import { getSubmissionStatus, downloadMessage } from '../../../../../lib/anaf/efactura-client';
import { mapStare } from '../../../../../lib/anaf/efactura-sync';

import { requireRole } from '../../../../../lib/require-role';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Download the ANAF response ZIP for a rejected upload and extract the human
// validation messages (CIUS-RO errors carry an `errorMessage="..."` attribute).
async function fetchAnafErrors(companyId: string, idDescarcare: string): Promise<string | null> {
  try {
    const dl = await downloadMessage(companyId, idDescarcare);
    if (!dl.ok || !dl.bytes) return null;
    const dec = new TextDecoder('utf-8');
    const msgs: string[] = [];
    const collect = (text: string) => {
      const re = /errorMessage\s*=\s*"([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) msgs.push(m[1].trim());
    };
    // The response may be a ZIP or a bare XML.
    try {
      const files = unzipSync(new Uint8Array(dl.bytes));
      for (const name of Object.keys(files)) collect(dec.decode(files[name]));
    } catch {
      collect(dec.decode(new Uint8Array(dl.bytes)));
    }
    if (!msgs.length) return null;
    // De-dup + cap length so it fits the column / UI.
    return [...new Set(msgs)].join(' • ').slice(0, 1000);
  } catch {
    return null;
  }
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

  const { status, error, idDescarcare } = mapStare(res.raw);
  if (!status) {
    // Still processing at ANAF — keep the current status, report back.
    return json({ ok: true, status: inv.efacturaStatus, processing: true });
  }

  // For a rejection, fetch the real ANAF validation messages.
  let finalError = error;
  if (status === 'rejected' && idDescarcare) {
    const detail = await fetchAnafErrors(companyId, idDescarcare);
    if (detail) finalError = detail;
  }

  try {
    await db.update(transportInvoices).set({
      efacturaStatus: status,
      efacturaError: status === 'rejected' ? finalError : null,
      updatedAt: new Date(),
    }).where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, companyId)));
  } catch { /* best-effort */ }

  return json({ ok: true, status, error: finalError, idDescarcare });
};
