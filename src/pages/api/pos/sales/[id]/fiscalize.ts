// Persistă rezultatul fiscalizării unui bon POS, după ce browserul a comandat
// aparatul fiscal (ErpNet.FP) la casă. Driverul e pe localhost-ul casei, deci
// emiterea bonului se face client-side; aici doar salvăm ce-a întors aparatul.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { posSales } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../../../../../lib/require-role';

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'pos.use');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const saleId = String(params.id || '').trim();
  if (!saleId) return new Response(JSON.stringify({ error: 'Bon inexistent' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const status = body.status === 'printed' ? 'printed' : 'error';
  const fiscalReceiptNumber = body.fiscalReceiptNumber ? String(body.fiscalReceiptNumber).slice(0, 64) : null;
  const fiscalSerial = body.fiscalSerial ? String(body.fiscalSerial).slice(0, 64) : null;
  const fiscalError = body.error ? String(body.error).slice(0, 1000) : null;

  // Bonul trebuie să aparțină companiei apelantului (anti cross-tenant).
  const [sale] = await db.select({ id: posSales.id }).from(posSales)
    .where(and(eq(posSales.id, saleId), eq(posSales.companyId, cid))).limit(1);
  if (!sale) return new Response(JSON.stringify({ error: 'Bon inexistent' }), { status: 404 });

  try {
    await db.update(posSales).set({
      fiscalStatus: status,
      fiscalReceiptNumber: status === 'printed' ? fiscalReceiptNumber : null,
      fiscalSerial: status === 'printed' ? fiscalSerial : null,
      fiscalError: status === 'error' ? fiscalError : null,
      fiscalPrintedAt: status === 'printed' ? new Date() : null,
    } as any).where(and(eq(posSales.id, saleId), eq(posSales.companyId, cid)));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvarea fiscalizării' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
