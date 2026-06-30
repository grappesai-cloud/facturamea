// POST /api/contabilitate/avansuri — grant a treasury advance (cont 542) to an
// employee. Amount comes in RON; stored as cents.
import type { APIRoute } from 'astro';
import { db, treasuryAdvances } from '../../../../db';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';
import { ensureAdvancesTable } from '../../../../lib/treasury-advances';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId; if (!cid) return json({ error: 'Companie lipsă' }, 400);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const employeeName = String(b.employeeName || '').trim().slice(0, 200);
  const amountRon = Number(b.amountRon);
  const grantedDate = String(b.grantedDate || '').slice(0, 10);
  if (!employeeName || !(amountRon > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(grantedDate)) {
    return json({ error: 'Completează angajatul, suma (> 0) și data.' }, 400);
  }

  await ensureAdvancesTable();
  const id = nanoid();
  await db.insert(treasuryAdvances).values({
    id, companyId: cid, employeeName,
    employeeId: (b.employeeId as string) || null,
    grantedDate, grantedCents: Math.round(amountRon * 100),
    method: b.method === 'bank' ? 'bank' : 'cash',
    notes: String(b.notes || '').slice(0, 500) || null,
  } as any);
  return json({ ok: true, id });
};
