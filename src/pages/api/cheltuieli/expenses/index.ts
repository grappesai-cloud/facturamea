// Expenses (cheltuieli) — incoming supplier invoices / receipts. List + create.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { expenses, suppliers, companies } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';
import { captureBnrSnapshot } from '../../../../lib/bnr-fx';

const DOC_TYPES = ['factura', 'bon', 'chitanta', 'extras'];
const STATUSES = ['unpaid', 'partial', 'paid'];
const VAT_SCHEMES = ['normal', 'reverse_charge'];

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const status = url.searchParams.get('status')?.trim();
  const category = url.searchParams.get('category')?.trim();

  let results: any[] = [];
  try {
    const conds: any[] = [eq(expenses.companyId, cid)];
    if (status && STATUSES.includes(status)) conds.push(eq(expenses.status, status));
    if (category) conds.push(eq(expenses.category, category));
    results = await db
      .select({
        id: expenses.id,
        supplierId: expenses.supplierId,
        supplierNameSnap: expenses.supplierNameSnap,
        supplierName: suppliers.name,
        category: expenses.category,
        documentType: expenses.documentType,
        documentNumber: expenses.documentNumber,
        issueDate: expenses.issueDate,
        dueDate: expenses.dueDate,
        currency: expenses.currency,
        netCents: expenses.netCents,
        vatCents: expenses.vatCents,
        totalCents: expenses.totalCents,
        paidCents: expenses.paidCents,
        status: expenses.status,
        deductible: expenses.deductible,
        vatScheme: expenses.vatScheme,
        notes: expenses.notes,
        createdAt: expenses.createdAt,
      })
      .from(expenses)
      .leftJoin(suppliers, eq(expenses.supplierId, suppliers.id))
      .where(and(...conds))
      .orderBy(desc(expenses.issueDate), desc(expenses.createdAt))
      .limit(300);
  } catch {
    results = [];
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const vatScheme = VAT_SCHEMES.includes(body.vatScheme) ? body.vatScheme : 'normal';
  const reverseCharge = vatScheme === 'reverse_charge';
  const netCents = Math.max(0, Math.round(Number(body.netCents) || 0));
  const vatCents = Math.max(0, Math.round(Number(body.vatCents) || 0));
  // Taxare inversă: TVA-ul e auto-lichidat (4426+4427), NU se datorează furnizorului,
  // deci suma de plată = net. Altfel, total = net + TVA (sau cel transmis explicit).
  const totalCents = reverseCharge
    ? netCents
    : body.totalCents != null ? Math.max(0, Math.round(Number(body.totalCents))) : netCents + vatCents;
  if (totalCents <= 0) return new Response(JSON.stringify({ error: 'Suma cheltuielii e obligatorie' }), { status: 400 });

  const paidCents = Math.max(0, Math.round(Number(body.paidCents) || 0));
  const status = paidCents >= totalCents && totalCents > 0 ? 'paid' : paidCents > 0 ? 'partial' : 'unpaid';
  const documentType = DOC_TYPES.includes(body.documentType) ? body.documentType : 'factura';
  const currency = (body.currency || 'RON').toUpperCase().slice(0, 5);
  const issueDate = body.issueDate || new Date().toISOString().slice(0, 10);
  // Period lock: no new expense dated inside a closed month.
  try {
    const [co] = await db.select({ locked: companies.ledgerLockedUntil }).from(companies).where(eq(companies.id, cid)).limit(1);
    if (co?.locked && issueDate <= co.locked) {
      return new Response(JSON.stringify({ error: `Perioada e închisă (blocată până la ${co.locked}). Alege o dată ulterioară sau redeschide luna.` }), { status: 422 });
    }
  } catch { /* don't block on read error */ }
  // Freeze the BNR rate for non-RON expenses so declarations (D300/D394/D390)
  // report the base + VAT in RON, not at face value.
  const bnr = currency !== 'RON' ? await captureBnrSnapshot(issueDate, currency).catch(() => null) : null;

  const id = nanoid();
  try {
    await db.insert(expenses).values({
      id,
      companyId: cid,
      supplierId: body.supplierId ? String(body.supplierId) : null,
      supplierNameSnap: body.supplierNameSnap?.trim() || null,
      category: body.category?.trim() || null,
      documentType,
      documentNumber: body.documentNumber?.trim() || null,
      issueDate,
      dueDate: body.dueDate || null,
      currency,
      bnrRate: bnr?.rate ?? null,
      netCents,
      vatCents,
      totalCents,
      paidCents,
      status,
      deductible: body.deductible !== false,
      vatScheme,
      attachmentUrl: body.attachmentUrl?.trim() || null,
      attachmentName: body.attachmentName?.trim() || null,
      notes: body.notes?.trim() || null,
      createdByUserId: locals.user.id,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }

  // Learn: remember this classification on the supplier so the next expense from
  // the same supplier pre-fills automatically (deterministic per-supplier memory).
  const learnCategory = body.category?.trim() || null;
  if (body.supplierId && learnCategory) {
    try {
      await db.update(suppliers).set({
        defaultCategory: learnCategory,
        defaultDeductible: body.deductible !== false,
        defaultVatScheme: vatScheme,
      }).where(and(eq(suppliers.id, String(body.supplierId)), eq(suppliers.companyId, cid)));
    } catch { /* non-fatal */ }
  }

  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
