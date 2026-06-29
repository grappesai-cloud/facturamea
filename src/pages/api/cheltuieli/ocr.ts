// POST /api/cheltuieli/ocr — extract structured fields from an uploaded
// receipt/invoice. PDFs are read from their TEXT LAYER first (no AI, free); AI
// (Claude vision) is only a fallback for images / scanned PDFs without text.
// Does NOT create the expense; the UI lets the user confirm the fields first.
//
// Multipart form-data: field `file` (image/* or application/pdf).
// Returns { ok:true, fields } or { ok:false, error }. Never 500s on a bad file.
import type { APIRoute } from 'astro';
import { ocrExpense } from '../../../lib/expense-ocr';
import { parseExpensePdf } from '../../../lib/expense-pdf';
import { db, companies } from '../../../db';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/require-role';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB cap.
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  if (!locals.user.companyId) return json({ ok: false, error: 'Companie lipsă' }, 400);

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return json({ ok: false, error: 'Cerere invalidă.' }, 400);
  }
  if (!file || file.size === 0) return json({ ok: false, error: 'Niciun fișier încărcat.' }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: 'Fișier prea mare (max 12 MB).' }, 400);

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return json({ ok: false, error: 'Nu am putut citi fișierul.' }, 400); }

  const mediaType = (file.type || '').toLowerCase();
  const isPdf = mediaType === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  // 1) PDF text layer — no AI. Covers most digital invoices (incl. foreign).
  if (isPdf) {
    let ownCui: string | null = null;
    try {
      const [c] = await db.select({ cui: companies.cui }).from(companies).where(eq(companies.id, locals.user.companyId)).limit(1);
      ownCui = c?.cui ?? null;
    } catch { /* best-effort */ }
    try {
      const pdf = await parseExpensePdf(bytes, ownCui);
      if (pdf.ok) return json({ ok: true, fields: pdf.fields, source: 'pdf-text' });
    } catch { /* fall through to AI */ }
  }

  // 2) AI fallback (images / scanned PDFs without a text layer). Optional.
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ ok: false, error: isPdf
      ? 'PDF-ul nu are text de citit (pare scanat) și scanarea AI nu e activă. Completează manual sau încarcă XML-ul e-Factura.'
      : 'Scanarea automată a pozelor nu e disponibilă acum. Completează manual sau încarcă PDF/XML.' });
  }
  const result = await ocrExpense(bytes, mediaType);
  return json(result);
};
