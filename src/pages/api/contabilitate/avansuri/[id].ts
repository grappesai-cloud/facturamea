// PATCH /api/contabilitate/avansuri/:id — settle an advance (decont): justified
// amount (settled, via expenses) + returned cash. status becomes 'settled' when
// granted = settled + returned. DELETE removes it.
import type { APIRoute } from 'astro';
import { db, treasuryAdvances } from '../../../../db';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';
import { ensureAdvancesTable } from '../../../../lib/treasury-advances';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId; if (!cid) return json({ error: 'Companie lipsă' }, 400);
  const id = String(params.id || '');

  await ensureAdvancesTable();
  const [adv] = await db.select().from(treasuryAdvances).where(and(eq(treasuryAdvances.id, id), eq(treasuryAdvances.companyId, cid)));
  if (!adv) return json({ error: 'Avans inexistent' }, 404);

  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const settledCents = Math.max(0, Math.round(Number(b.settledRon || 0) * 100));
  const returnedCents = Math.max(0, Math.round(Number(b.returnedRon || 0) * 100));
  if (settledCents + returnedCents > (adv.grantedCents || 0)) {
    return json({ error: 'Justificat + restituit depășește avansul acordat.' }, 400);
  }
  const balance = (adv.grantedCents || 0) - settledCents - returnedCents;
  const settledDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.settledDate || '')) ? String(b.settledDate) : new Date().toISOString().slice(0, 10);

  await db.update(treasuryAdvances).set({
    settledCents, returnedCents,
    status: balance === 0 ? 'settled' : 'open',
    settledDate,
  } as any).where(eq(treasuryAdvances.id, id));
  return json({ ok: true, balanceCents: balance });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId; if (!cid) return json({ error: 'Companie lipsă' }, 400);
  await ensureAdvancesTable();
  await db.delete(treasuryAdvances).where(and(eq(treasuryAdvances.id, String(params.id || '')), eq(treasuryAdvances.companyId, cid)));
  return json({ ok: true });
};
