// POST /api/anaf/inbox/sync — pulls received e-Factura messages from ANAF SPV
// for the current company and upserts them into efactura_inbox (dedupe on
// (companyId, anafMsgId)). Returns { ok, synced, total } or { ok:false, error }.
//
// Guarded: never 500s when ANAF is unconfigured. If the company is not
// connected, returns { ok:false, error } with a clear Romanian message.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { efacturaInbox } from '../../../../db/schema';
import { getAnafStatus } from '../../../../lib/anaf/tokens';
import { listMessages } from '../../../../lib/anaf/efactura-client';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ANAF SPV listaMesajeFactura returns JSON like:
//   { mesaje: [{ data_creare, cif, id_solicitare, detalii, tip, id }], ... }
// Field names can vary slightly; we read defensively.
function parseMessages(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.mesaje)) return data.mesaje;
  return [];
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  let anaf: { connected: boolean; cif: string | null };
  try {
    anaf = await getAnafStatus(companyId);
  } catch {
    anaf = { connected: false, cif: null };
  }
  if (!anaf.connected || !anaf.cif) {
    return json({ ok: false, error: 'ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.' });
  }

  const res = await listMessages(companyId, anaf.cif, 60);
  if (!res.ok) {
    return json({ ok: false, error: res.error || 'Nu s-au putut prelua mesajele din SPV.' });
  }

  const messages = parseMessages(res.data);
  let synced = 0;

  for (const m of messages) {
    const anafMsgId = String(m?.id ?? m?.id_solicitare ?? m?.idSolicitare ?? '').trim();
    if (!anafMsgId) continue;

    // Only inbound invoices matter for "facturi primite". ANAF marks these
    // with tip "FACTURA PRIMITA"; keep ERORI / others out of the inbox.
    const msgType = String(m?.tip ?? m?.tip_factura ?? '').trim() || null;
    if (msgType && !/primit/i.test(msgType)) continue;

    const detail = String(m?.detalii ?? m?.detail ?? '').trim() || null;
    const fromCif = String(m?.cif_emitent ?? m?.cif ?? '').replace(/^RO/i, '').replace(/\D/g, '') || null;

    // data_creare comes as "YYYYMMDDHHmm" or an ISO-ish string; convert
    // best-effort. Failures fall back to null (kept nullable in schema).
    let receivedAt: Date | null = null;
    let issueDate: string | null = null;
    const dc = String(m?.data_creare ?? m?.dataCreare ?? '').trim();
    if (/^\d{12}$/.test(dc)) {
      const y = dc.slice(0, 4), mo = dc.slice(4, 6), d = dc.slice(6, 8), h = dc.slice(8, 10), mi = dc.slice(10, 12);
      receivedAt = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`);
      issueDate = `${y}-${mo}-${d}`;
    } else if (dc) {
      const parsed = new Date(dc);
      if (!isNaN(parsed.getTime())) {
        receivedAt = parsed;
        issueDate = parsed.toISOString().slice(0, 10);
      }
    }

    try {
      await db.insert(efacturaInbox).values({
        id: nanoid(),
        companyId,
        anafMsgId,
        msgType,
        fromCif,
        supplierName: null,
        detail,
        xml: null,
        totalCents: null,
        currency: 'RON',
        issueDate,
        status: 'nou',
        importedExpenseId: null,
        receivedAt,
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: [efacturaInbox.companyId, efacturaInbox.anafMsgId],
        // Refresh metadata that may have been filled in by ANAF since last sync,
        // but never clobber status / imported link / downloaded xml.
        set: { msgType, fromCif, detail },
      });
      synced++;
    } catch {
      // skip malformed rows, keep going
    }
  }

  return json({ ok: true, synced, total: messages.length });
};
