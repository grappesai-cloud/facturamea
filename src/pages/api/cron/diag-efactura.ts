// TEMP diagnostic — pull ANAF's real rejection reason for invoices with an
// upload index. Guarded by CRON_SECRET. DELETE after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices } from '../../../db';
import { and, isNotNull } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { getSubmissionStatus, downloadMessage } from '../../../lib/anaf/efactura-client';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const rows = await db.select({
    fullNumber: transportInvoices.fullNumber, kind: transportInvoices.kind,
    companyId: transportInvoices.companyId, anafId: transportInvoices.efacturaAnafId,
  }).from(transportInvoices).where(and(isNotNull(transportInvoices.efacturaAnafId))).limit(20);

  const out: any[] = [];
  for (const r of rows) {
    const entry: any = { nr: r.fullNumber, anafId: r.anafId };
    try {
      const st = await getSubmissionStatus(r.companyId, r.anafId as string);
      if (!st.ok || !st.raw) { entry.error = st.error; out.push(entry); continue; }
      entry.stare = st.raw.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || '';
      const idDesc = st.raw.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || '';
      if (idDesc) {
        const dl = await downloadMessage(r.companyId, idDesc);
        if (dl.ok && dl.bytes) {
          let all = '';
          try { const files = unzipSync(new Uint8Array(dl.bytes)); for (const [n, b] of Object.entries(files)) if (/\.(xml|txt)$/i.test(n)) all += strFromU8(b as Uint8Array); }
          catch { all = strFromU8(new Uint8Array(dl.bytes)); }
          entry.errors = Array.from(all.matchAll(/errorMessage\s*=\s*"([^"]+)"/gi)).map((m) => m[1]).slice(0, 25);
        }
      }
    } catch (e) { entry.error = String((e as Error).message); }
    out.push(entry);
  }
  return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
