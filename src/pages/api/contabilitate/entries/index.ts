import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { journalEntries, journalLines, companies } from '../../../../db/schema';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { postEntry } from '../../../../lib/accounting';
import { requireRole } from '../../../../lib/require-role';

// GET — list journal entries (note contabile) for the current company, with
// their lines. Optional ?from=&to= period filter.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });

  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';

  try {
    const where = [eq(journalEntries.companyId, cid)];
    if (from) where.push(gte(journalEntries.entryDate, from));
    if (to) where.push(lte(journalEntries.entryDate, to));

    const entries = await db
      .select()
      .from(journalEntries)
      .where(and(...where))
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.entryNumber))
      .limit(300);

    const ids = entries.map((e) => e.id);
    const linesByEntry = new Map<string, any[]>();
    if (ids.length > 0) {
      const allLines = await db.select().from(journalLines).where(eq(journalLines.companyId, cid));
      for (const l of allLines) {
        if (!ids.includes(l.entryId)) continue;
        const arr = linesByEntry.get(l.entryId) || [];
        arr.push({ accountCode: l.accountCode, debitCents: l.debitCents, creditCents: l.creditCents, note: l.note });
        linesByEntry.set(l.entryId, arr);
      }
    }

    const results = entries.map((e) => ({ ...e, lines: linesByEntry.get(e.id) || [] }));
    return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ results: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// POST — add a manual nota contabilă. Body: { entryDate, description, lines: [{accountCode, debitCents, creditCents, note?}] }.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage');
  if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({})) as any;
  if (!Array.isArray(body.lines) || body.lines.length < 2) {
    return new Response(JSON.stringify({ error: 'O notă are nevoie de cel puțin două rânduri.' }), { status: 400 });
  }

  const res = await postEntry(cid, {
    entryDate: body.entryDate || new Date().toISOString().slice(0, 10),
    description: body.description || null,
    source: 'manual',
    lines: body.lines.map((l: any) => ({
      accountCode: String(l.accountCode || '').trim(),
      debitCents: Math.round(Number(l.debitCents) || 0),
      creditCents: Math.round(Number(l.creditCents) || 0),
      note: l.note || null,
    })),
    createdByUserId: locals.user.id,
  });

  if (!res.ok) return new Response(JSON.stringify({ error: res.error }), { status: 400 });
  return new Response(JSON.stringify({ ok: true, entryId: res.entryId, entryNumber: res.entryNumber }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};

// DELETE /api/contabilitate/entries?id=... — remove a MANUAL note from an OPEN
// period. Entries posted automatically (from invoices/expenses/payments) or in a
// locked period are immutable (the proper correction is a reversing note).
export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  const id = url.searchParams.get('id') || '';
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });

  const [entry] = await db.select().from(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.companyId, cid))).limit(1);
  if (!entry) return new Response(JSON.stringify({ error: 'Notă inexistentă' }), { status: 404 });
  if (entry.source !== 'manual') {
    return new Response(JSON.stringify({ error: 'Doar notele manuale pot fi șterse. Notele generate automat se corectează prin stornare.' }), { status: 422 });
  }
  const [co] = await db.select({ lock: companies.ledgerLockedUntil }).from(companies).where(eq(companies.id, cid)).limit(1);
  if (co?.lock && entry.entryDate && entry.entryDate <= co.lock) {
    return new Response(JSON.stringify({ error: `Perioada e închisă (blocată până la ${co.lock}). Redeschide luna ca să ștergi nota.` }), { status: 422 });
  }

  await db.delete(journalLines).where(eq(journalLines.entryId, id));
  await db.delete(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.companyId, cid)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
