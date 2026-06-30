// DELETE /api/contabilitate/retineri/:id — remove a withholding entry.
import type { APIRoute } from 'astro';
import { db, withholdingEntries } from '../../../../db';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';
import { ensureWithholdingTable } from '../../../../lib/withholding';

const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId; if (!cid) return json({ error: 'Companie lipsă' }, 400);
  await ensureWithholdingTable();
  await db.delete(withholdingEntries).where(and(eq(withholdingEntries.id, String(params.id || '')), eq(withholdingEntries.companyId, cid)));
  return json({ ok: true });
};
