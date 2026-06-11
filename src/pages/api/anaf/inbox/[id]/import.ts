// POST /api/anaf/inbox/[id]/import — creates an `expenses` row from a received
// e-Factura inbox item, then marks the inbox row as 'importat' and links the
// new expense id. Returns { ok, expenseId } or { ok:false, error }.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { efacturaInbox, expenses } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  const id = params.id as string;
  if (!id) return json({ ok: false, error: 'ID lipsă' }, 400);

  let row: typeof efacturaInbox.$inferSelect | undefined;
  try {
    [row] = await db.select().from(efacturaInbox)
      .where(and(eq(efacturaInbox.id, id), eq(efacturaInbox.companyId, companyId)))
      .limit(1);
  } catch {
    return json({ ok: false, error: 'Baza de date indisponibilă.' }, 503);
  }
  if (!row) return json({ ok: false, error: 'Documentul nu există' }, 404);
  if (row.status === 'importat' && row.importedExpenseId) {
    return json({ ok: false, error: 'Această factură a fost deja importată ca cheltuială.' });
  }

  // The inbox row stores total only (ANAF list view). We record total as both
  // total and net so accounting balances; VAT can be split later in Cheltuieli.
  const totalCents = row.totalCents ?? 0;
  const expenseId = nanoid();

  try {
    await db.insert(expenses).values({
      id: expenseId,
      companyId,
      supplierNameSnap: row.supplierName || row.fromCif || 'Furnizor e-Factura',
      documentType: 'factura',
      documentNumber: row.detail || row.anafMsgId,
      issueDate: row.issueDate ?? null,
      currency: row.currency || 'RON',
      netCents: totalCents,
      vatCents: 0,
      totalCents,
      paidCents: 0,
      status: 'unpaid',
      deductible: true,
      notes: `Importat din e-Factura (SPV), mesaj ${row.anafMsgId}.`,
      createdByUserId: locals.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.update(efacturaInbox).set({
      status: 'importat',
      importedExpenseId: expenseId,
    }).where(eq(efacturaInbox.id, row.id));
  } catch (e) {
    return json({ ok: false, error: 'Nu s-a putut crea cheltuiala.' }, 502);
  }

  return json({ ok: true, expenseId });
};
