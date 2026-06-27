// Shared ANAF SPV inbox sync: pulls received e-Factura messages and upserts them
// into efactura_inbox (dedupe on (companyId, anafMsgId)). Used both by the
// on-demand route (/api/anaf/inbox/sync) and the daily cron (auto-sync), so a
// user never has to press "Sincronizează" just to see new supplier invoices.
import { db } from '../../db';
import { efacturaInbox, anafConnections } from '../../db/schema';
import { listMessages } from './efactura-client';
import { and, isNull, inArray, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// ANAF SPV listaMesajeFactura returns JSON like:
//   { mesaje: [{ data_creare, cif, id_solicitare, detalii, tip, id }], ... }
// Field names vary slightly; read defensively.
function parseMessages(data: any): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.mesaje)) return data.mesaje;
  return [];
}

/** Sync one company's SPV inbox. Never throws — returns a result object. */
export async function syncInboxForCompany(companyId: string, cif: string): Promise<{ ok: boolean; synced: number; total: number; error?: string }> {
  const res = await listMessages(companyId, cif, 60).catch((e) => ({ ok: false, error: e?.message } as any));
  if (!res.ok) return { ok: false, synced: 0, total: 0, error: res.error || 'Nu s-au putut prelua mesajele din SPV.' };

  const messages = parseMessages(res.data);
  let synced = 0;

  for (const m of messages) {
    const anafMsgId = String(m?.id ?? m?.id_solicitare ?? m?.idSolicitare ?? '').trim();
    if (!anafMsgId) continue;

    // Only inbound invoices ("FACTURA PRIMITA"); keep ERORI / others out.
    const msgType = String(m?.tip ?? m?.tip_factura ?? '').trim() || null;
    if (msgType && !/primit/i.test(msgType)) continue;

    const detail = String(m?.detalii ?? m?.detail ?? '').trim() || null;
    const fromCif = String(m?.cif_emitent ?? m?.cif ?? '').replace(/^RO/i, '').replace(/\D/g, '') || null;

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
        // Refresh metadata ANAF may have filled in since last sync, but never
        // clobber status / imported link / downloaded xml.
        set: { msgType, fromCif, detail },
      });
      synced++;
    } catch {
      // skip malformed rows, keep going
    }
  }

  return { ok: true, synced, total: messages.length };
}

/** Auto-sync every connected company's SPV inbox (called from the daily cron). */
export async function syncAllInboxes(): Promise<{ companies: number; synced: number; failed: number }> {
  const now = new Date();
  const conns = await db
    .select({ companyId: anafConnections.companyId, cif: anafConnections.cif })
    .from(anafConnections)
    .where(and(isNull(anafConnections.revokedAt), inArray(anafConnections.scope, ['e-factura', 'spv']), gt(anafConnections.refreshExpiresAt, now)));

  // One live connection per company is enough; dedupe on companyId.
  const seen = new Set<string>();
  let companies = 0, synced = 0, failed = 0;
  for (const c of conns) {
    if (!c.cif || seen.has(c.companyId)) continue;
    seen.add(c.companyId);
    companies++;
    try {
      const r = await syncInboxForCompany(c.companyId, c.cif);
      if (r.ok) synced += r.synced; else failed++;
    } catch {
      failed++;
    }
  }
  return { companies, synced, failed };
}
