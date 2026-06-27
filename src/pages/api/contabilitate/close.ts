// POST /api/contabilitate/close
//   { year, month, action: 'lock' }   → post everything unposted, then freeze
//                                        the period (companies.ledgerLockedUntil
//                                        = last day of the month).
//   { year, month, action: 'unlock' }  → owner only; move the lock back before
//                                        this month (re-opens it + everything after).
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/require-role';
import { autoPostAll } from '../../../lib/accounting';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Last day of (year, month) as YYYY-MM-DD. month is 1-based.
function lastDay(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);

  const body = await request.json().catch(() => ({})) as any;
  const year = Math.floor(Number(body.year));
  const month = Math.floor(Number(body.month)); // 1-12
  const action = body.action === 'unlock' ? 'unlock' : 'lock';
  if (!year || month < 1 || month > 12) return json({ error: 'Perioadă invalidă' }, 400);

  if (action === 'unlock') {
    // Re-opening a closed period is sensitive — owner only.
    if ((locals.company?.role || '') !== 'owner') {
      return json({ error: 'Doar administratorul firmei poate redeschide o lună închisă.' }, 403);
    }
    // Move the lock to the end of the previous month (null if unlocking January).
    const newLock = month === 1 ? null : lastDay(year, month - 1);
    try {
      await db.update(companies).set({ ledgerLockedUntil: newLock }).where(eq(companies.id, cid));
    } catch { return json({ error: 'Nu am putut redeschide perioada.' }, 500); }
    return json({ ok: true, lockedUntil: newLock });
  }

  // Lock: post everything unposted first, so the closed month's ledger is complete.
  let posted: Awaited<ReturnType<typeof autoPostAll>> | null = null;
  try { posted = await autoPostAll(cid, locals.user.id); } catch { /* still allow lock */ }

  const lockedUntil = lastDay(year, month);
  try {
    await db.update(companies).set({ ledgerLockedUntil: lockedUntil }).where(eq(companies.id, cid));
  } catch { return json({ error: 'Nu am putut închide perioada.' }, 500); }
  return json({ ok: true, lockedUntil, posted });
};
