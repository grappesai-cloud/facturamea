// GET /api/anaf/inbox/[id]/download — returns the stored XML for a received
// e-Factura. If the row has no XML yet, fetches it from ANAF SPV (descarcare),
// stores it, and returns it.
//
// Guarded: never 500s when ANAF is unconfigured.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { efacturaInbox } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { getAnafStatus } from '../../../../../lib/anaf/tokens';
import { downloadMessage } from '../../../../../lib/anaf/efactura-client';
import { extractInvoiceXml } from '../../../../../lib/efactura-parse';

// A real UBL invoice XML (not a zip decoded as garbage, not a signature file).
const looksLikeInvoice = (s: string) => /<(\w+:)?(Invoice|CreditNote)\b/.test(s);

const errJson = (error: string, status = 400) =>
  new Response(JSON.stringify({ ok: false, error }), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return errJson('Neautentificat', 401);
  const companyId = locals.user.companyId;
  if (!companyId) return errJson('Fără firmă', 400);

  const id = params.id as string;
  if (!id) return errJson('ID lipsă', 400);

  let row: typeof efacturaInbox.$inferSelect | undefined;
  try {
    [row] = await db.select().from(efacturaInbox)
      .where(and(eq(efacturaInbox.id, id), eq(efacturaInbox.companyId, companyId)))
      .limit(1);
  } catch {
    return errJson('Baza de date indisponibilă.', 503);
  }
  if (!row) return errJson('Documentul nu există', 404);

  const respondXml = (xml: string) =>
    new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="efactura-${row!.anafMsgId}.xml"`,
      },
    });

  // Only trust the cache if it's a real invoice XML — an earlier bug cached the
  // zip decoded as garbage text; re-fetch in that case.
  if (row.xml && looksLikeInvoice(row.xml)) return respondXml(row.xml);

  // Not cached (or cached badly) — fetch from SPV. ANAF returns a ZIP (invoice
  // XML + signature); extract the invoice XML so the viewer can render it.
  let anaf: { connected: boolean; cif: string | null };
  try { anaf = await getAnafStatus(companyId); } catch { anaf = { connected: false, cif: null }; }
  if (!anaf.connected) return errJson('ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.');

  const dl = await downloadMessage(companyId, row.anafMsgId);
  if (!dl.ok || !dl.bytes) return errJson(dl.error || 'Nu s-a putut descărca din SPV.');

  const xml = extractInvoiceXml(dl.bytes);
  if (xml && looksLikeInvoice(xml)) {
    try { await db.update(efacturaInbox).set({ xml }).where(eq(efacturaInbox.id, row.id)); } catch { /* best-effort cache */ }
    return respondXml(xml);
  }

  // Couldn't extract a clean invoice XML — return the raw zip for manual download.
  return new Response(dl.bytes, {
    headers: {
      'Content-Type': dl.contentType || 'application/zip',
      'Content-Disposition': `attachment; filename="efactura-${row.anafMsgId}.zip"`,
    },
  });
};
