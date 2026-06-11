import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { journalEntries, journalLines } from '../../../../db/schema';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { postEntry } from '../../../../lib/accounting';

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
