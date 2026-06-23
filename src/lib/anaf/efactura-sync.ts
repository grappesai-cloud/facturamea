// Re-poll ANAF for the final verdict of e-Factura uploads still in 'submitted'
// (received, pending validation) and persist 'validated' / 'rejected'. An upload
// index alone does NOT mean acceptance — only stareMesaj does. Run from the cron
// so the platform reflects the real ANAF status without manual checks.
import { db } from '../../db';
import { transportInvoices } from '../../db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { getSubmissionStatus } from './efactura-client';

export function mapStare(raw: string): { status: 'validated' | 'rejected' | null; error: string | null; idDescarcare: string | null } {
  const stare = (raw.match(/stare\s*=\s*"([^"]+)"/i)?.[1] || '').toLowerCase();
  const idDescarcare = raw.match(/id_descarcare\s*=\s*"([^"]+)"/i)?.[1] || null;
  if (stare === 'ok') return { status: 'validated', error: null, idDescarcare };
  if (stare === 'nok') {
    return {
      status: 'rejected',
      error: 'Respinsă de ANAF la validare' + (idDescarcare ? ` (detalii ANAF id ${idDescarcare})` : '.'),
      idDescarcare,
    };
  }
  return { status: null, error: null, idDescarcare }; // în prelucrare / necunoscut
}

export async function syncEfacturaStatuses(limit = 200): Promise<{ checked: number; validated: number; rejected: number }> {
  const rows = await db.select({
    id: transportInvoices.id,
    companyId: transportInvoices.companyId,
    anafId: transportInvoices.efacturaAnafId,
  }).from(transportInvoices)
    .where(and(eq(transportInvoices.efacturaStatus, 'submitted'), isNotNull(transportInvoices.efacturaAnafId)))
    .limit(limit);

  let checked = 0, validated = 0, rejected = 0;
  for (const r of rows) {
    checked++;
    try {
      const st = await getSubmissionStatus(r.companyId, r.anafId as string);
      if (!st.ok || !st.raw) continue;
      const { status, error } = mapStare(st.raw);
      if (!status) continue; // still processing
      await db.update(transportInvoices).set({
        efacturaStatus: status,
        efacturaError: status === 'rejected' ? error : null,
        updatedAt: new Date(),
      }).where(eq(transportInvoices.id, r.id));
      if (status === 'validated') validated++; else rejected++;
    } catch { /* skip this one, keep going */ }
  }
  return { checked, validated, rejected };
}
