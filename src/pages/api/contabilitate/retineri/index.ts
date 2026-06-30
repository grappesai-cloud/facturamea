// POST /api/contabilitate/retineri — record a withheld-at-source payment (D205).
import type { APIRoute } from 'astro';
import { db, withholdingEntries } from '../../../../db';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';
import { ensureWithholdingTable } from '../../../../lib/withholding';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
const TYPES = ['dividende', 'chirii', 'drepturi_autor', 'alte'];

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId; if (!cid) return json({ error: 'Companie lipsă' }, 400);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const beneficiaryName = String(b.beneficiaryName || '').trim().slice(0, 200);
  const grossRon = Number(b.grossRon);
  const paidDate = String(b.paidDate || '').slice(0, 10);
  if (!beneficiaryName || !(grossRon > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) {
    return json({ error: 'Completează beneficiarul, suma brută (> 0) și data.' }, 400);
  }
  const taxPct = Number(b.taxPct);
  const pct = Number.isFinite(taxPct) && taxPct >= 0 && taxPct <= 100 ? taxPct : 8;
  const grossCents = Math.round(grossRon * 100);
  const taxCents = Math.round(grossCents * pct / 100);
  const incomeType = TYPES.includes(String(b.incomeType)) ? String(b.incomeType) : 'dividende';

  await ensureWithholdingTable();
  const id = nanoid();
  await db.insert(withholdingEntries).values({
    id, companyId: cid, year: Number(paidDate.slice(0, 4)),
    paidDate, beneficiaryName,
    beneficiaryCnp: String(b.beneficiaryCnp || '').replace(/\D/g, '').slice(0, 20) || null,
    incomeType, grossCents, taxPct: pct, taxCents, netCents: grossCents - taxCents,
    notes: String(b.notes || '').slice(0, 500) || null,
  } as any);
  return json({ ok: true, id });
};
