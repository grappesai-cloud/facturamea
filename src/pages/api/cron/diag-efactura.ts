// TEMPORARY diagnostic — for every invoice that has an ANAF upload index, ask
// ANAF for the real validation verdict and, when rejected, download + unzip the
// error file to surface the actual rejection reason. Guarded by CRON_SECRET.
// DELETE after use.
import type { APIRoute } from 'astro';
import { db, transportInvoices } from '../../../db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import { getSubmissionStatus, downloadMessage } from '../../../lib/anaf/efactura-client';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });

  const rows = await db.select({
    id: transportInvoices.id,
    fullNumber: transportInvoices.fullNumber,
    kind: transportInvoices.kind,
    companyId: transportInvoices.companyId,
    anafId: transportInvoices.efacturaAnafId,
    status: transportInvoices.efacturaStatus,
  }).from(transportInvoices)
    .where(and(isNotNull(transportInvoices.efacturaAnafId)))
    .limit(20);

  const out: any[] = [];
  for (const r of rows) {
    const entry: any = { nr: r.fullNumber, kind: r.kind, anafId: r.anafId, localStatus: r.status };
    try {
      const st = await getSubmissionStatus(r.companyId, r.anafId as string);
      if (!st.ok || !st.raw) { entry.error = st.error || 'no raw'; out.push(entry); continue; }
      entry.stareRaw = st.raw.slice(0, 500);
      const stare = st.raw.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || '';
      const idDesc = st.raw.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || '';
      entry.stare = stare;
      entry.idDescarcare = idDesc;
      if (idDesc) {
        const dl = await downloadMessage(r.companyId, idDesc);
        if (dl.ok && dl.bytes) {
          try {
            const files = unzipSync(new Uint8Array(dl.bytes));
            const texts: string[] = [];
            for (const [name, bytes] of Object.entries(files)) {
              if (/\.(xml|txt)$/i.test(name)) texts.push(`--- ${name} ---\n` + strFromU8(bytes as Uint8Array).slice(0, 2000));
            }
            const all = texts.join('\n');
            entry.errorMessages = Array.from(all.matchAll(/errorMessage\s*=\s*"([^"]+)"/gi)).map((m) => m[1]).slice(0, 20);
            entry.downloadText = all.slice(0, 2500);
          } catch (e) {
            // Not a zip — maybe plain XML
            const txt = strFromU8(new Uint8Array(dl.bytes)).slice(0, 2500);
            entry.errorMessages = Array.from(txt.matchAll(/errorMessage\s*=\s*"([^"]+)"/gi)).map((m) => m[1]).slice(0, 20);
            entry.downloadText = txt;
          }
        } else {
          entry.downloadError = dl.error;
        }
      }
    } catch (e) {
      entry.error = String((e as Error)?.message || e);
    }
    out.push(entry);
  }

  return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
