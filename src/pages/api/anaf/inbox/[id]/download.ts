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

  if (row.xml && row.xml.trim()) return respondXml(row.xml);

  // Not cached yet — fetch from SPV. ANAF returns a ZIP (XML + signature); we
  // store the raw response decoded as text. The browser still gets a download.
  let anaf: { connected: boolean; cif: string | null };
  try { anaf = await getAnafStatus(companyId); } catch { anaf = { connected: false, cif: null }; }
  if (!anaf.connected) return errJson('ANAF nu este conectat. Conectează firma din Setări → Integrare ANAF.');

  const dl = await downloadMessage(companyId, row.anafMsgId);
  if (!dl.ok || !dl.bytes) return errJson(dl.error || 'Nu s-a putut descărca din SPV.');

  // ANAF returns a ZIP archive — proxy the raw bytes for download. We also
  // best-effort cache a decoded preview so the next call is instant.
  let preview: string | null = null;
  try {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(dl.bytes);
    if (text.includes('<')) preview = text;
  } catch { /* binary zip, skip preview */ }
  if (preview) {
    try {
      await db.update(efacturaInbox).set({ xml: preview }).where(eq(efacturaInbox.id, row.id));
    } catch { /* best-effort cache */ }
  }

  return new Response(dl.bytes, {
    headers: {
      'Content-Type': dl.contentType || 'application/zip',
      'Content-Disposition': `attachment; filename="efactura-${row.anafMsgId}.zip"`,
    },
  });
};
