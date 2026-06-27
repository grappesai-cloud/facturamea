// POST /api/anaf/inbox/[id]/import — creates an `expenses` row from a received
// e-Factura inbox item, then marks the inbox row as 'importat' and links the
// new expense id. Returns { ok, expenseId } or { ok:false, error }.
//
// Accuracy: we now DOWNLOAD + PARSE the actual UBL XML (free, deterministic)
// to capture supplier, CUI, real document number/date and the VAT breakdown.
// The SPV list view only has the total, so without parsing VAT would be 0.
// Falls back gracefully to the list metadata if the XML can't be fetched/parsed.
import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { efacturaInbox, expenses, suppliers } from '../../../../../db/schema';
import { and, eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { suggestClassification } from '../../../../../lib/expense-classify';
import { getAnafStatus } from '../../../../../lib/anaf/tokens';
import { downloadMessage } from '../../../../../lib/anaf/efactura-client';
import { extractInvoiceXml, parseEfacturaXml, type ParsedInvoiceFields } from '../../../../../lib/efactura-parse';

import { requireRole } from '../../../../../lib/require-role';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
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

  // ── Try to enrich from the real UBL XML (free, exact) ─────────────────────
  let parsed: ParsedInvoiceFields | null = null;
  let xml: string | null = row.xml && row.xml.includes('<') ? row.xml : null;
  if (!xml) {
    try {
      const anaf = await getAnafStatus(companyId);
      if (anaf.connected) {
        const dl = await downloadMessage(companyId, row.anafMsgId);
        if (dl.ok && dl.bytes) {
          xml = extractInvoiceXml(new Uint8Array(dl.bytes as ArrayBuffer));
          if (xml) {
            try { await db.update(efacturaInbox).set({ xml }).where(eq(efacturaInbox.id, row.id)); } catch { /* best-effort cache */ }
          }
        }
      }
    } catch { /* fall back to list metadata below */ }
  }
  if (xml) {
    const r = parseEfacturaXml(xml);
    if (r.ok) parsed = r.fields;
  }

  // ── Build expense values: parsed (accurate) → else list metadata ──────────
  const totalCents = parsed?.totalCents || row.totalCents || 0;
  const netCents = parsed ? (parsed.netCents || totalCents) : totalCents;
  const vatCents = parsed ? parsed.vatCents : 0;
  const supplierName = parsed?.supplierName || row.supplierName || row.fromCif || 'Furnizor e-Factura';
  const documentNumber = parsed?.documentNumber || row.detail || row.anafMsgId;
  const issueDate = parsed?.issueDate || row.issueDate || null;
  const currency = parsed?.currency || row.currency || 'RON';
  const cuiNote = parsed?.supplierCui ? ` CUI furnizor: ${parsed.supplierCui}.` : '';
  const lineNote = parsed ? ` (${parsed.lineCount} linii, citit din XML)` : '';

  // Pre-classify (deterministic): match a known supplier by CUI to reuse its
  // learned defaults, else keyword rules on the supplier name.
  const cif = String(parsed?.supplierCui || row.fromCif || '').replace(/\D/g, '');
  let supplierRow: typeof suppliers.$inferSelect | null = null;
  if (cif) {
    try {
      const [s] = await db.select().from(suppliers)
        .where(and(eq(suppliers.companyId, companyId), or(eq(suppliers.cui, cif), eq(suppliers.cui, `RO${cif}`))))
        .limit(1);
      supplierRow = s || null;
    } catch { /* ignore */ }
  }
  const sugg = suggestClassification({ supplier: supplierRow, supplierName, documentText: documentNumber });

  const expenseId = nanoid();
  try {
    await db.insert(expenses).values({
      id: expenseId,
      companyId,
      supplierId: supplierRow?.id || null,
      supplierNameSnap: supplierName,
      category: sugg.category,
      documentType: 'factura',
      documentNumber,
      issueDate,
      currency,
      netCents,
      vatCents,
      totalCents,
      paidCents: 0,
      status: 'unpaid',
      deductible: sugg.deductible,
      deductiblePct: sugg.deductiblePct,
      vatScheme: sugg.vatScheme,
      notes: `Importat din e-Factura (SPV), mesaj ${row.anafMsgId}.${cuiNote}${lineNote}`,
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

  return json({ ok: true, expenseId, parsed: !!parsed });
};
