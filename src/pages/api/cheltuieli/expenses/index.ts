// Expenses (cheltuieli) — incoming supplier invoices / receipts. List + create.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { expenses, suppliers } from '../../../../db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const DOC_TYPES = ['factura', 'bon', 'chitanta', 'extras'];
const STATUSES = ['unpaid', 'partial', 'paid'];

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
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  const netCents = Math.max(0, Math.round(Number(body.netCents) || 0));
  const vatCents = Math.max(0, Math.round(Number(body.vatCents) || 0));
  const totalCents = body.totalCents != null ? Math.max(0, Math.round(Number(body.totalCents))) : netCents + vatCents;
  if (totalCents <= 0) return new Response(JSON.stringify({ error: 'Suma cheltuielii e obligatorie' }), { status: 400 });

  const paidCents = Math.max(0, Math.round(Number(body.paidCents) || 0));
  const status = paidCents >= totalCents && totalCents > 0 ? 'paid' : paidCents > 0 ? 'partial' : 'unpaid';
  const documentType = DOC_TYPES.includes(body.documentType) ? body.documentType : 'factura';

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
      issueDate: body.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: body.dueDate || null,
      currency: (body.currency || 'RON').toUpperCase().slice(0, 5),
      netCents,
      vatCents,
      totalCents,
      paidCents,
      status,
      deductible: body.deductible !== false,
      attachmentUrl: body.attachmentUrl?.trim() || null,
      attachmentName: body.attachmentName?.trim() || null,
      notes: body.notes?.trim() || null,
      createdByUserId: locals.user.id,
    } as any);
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500 });
  }
  return new Response(JSON.stringify({ id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
