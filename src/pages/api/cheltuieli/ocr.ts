// POST /api/cheltuieli/ocr — extract structured fields from an uploaded
// receipt/invoice WITHOUT AI where possible:
//   • PDF with a text layer  → pdf-parse (free)
//   • image / scanned receipt → Tesseract OCR (free, open-source)
// Claude vision is only a last-resort fallback. Does NOT create the expense.
//
// Multipart form-data: field `file` (image/* or application/pdf).
// Returns { ok:true, fields, source } or { ok:false, error }. Never 500s.
import type { APIRoute } from 'astro';
import { ocrExpense } from '../../../lib/expense-ocr';
import { parseExpensePdf } from '../../../lib/expense-pdf';
import { ocrImageExpense } from '../../../lib/expense-image-ocr';
import { db, companies } from '../../../db';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../lib/require-role';

const MAX_BYTES = 12 * 1024 * 1024;
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
  } catch { return json({ ok: false, error: 'Cerere invalidă.' }, 400); }
  if (!file || file.size === 0) return json({ ok: false, error: 'Niciun fișier încărcat.' }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: 'Fișier prea mare (max 12 MB).' }, 400);

  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return json({ ok: false, error: 'Nu am putut citi fișierul.' }, 400); }

  const mediaType = (file.type || '').toLowerCase();
  const isPdf = mediaType === 'application/pdf' || /\.pdf$/i.test(file.name || '');

  // Our own company CUI (to exclude the buyer when picking the supplier CUI).
  let ownCui: string | null = null;
  try {
    const [c] = await db.select({ cui: companies.cui }).from(companies).where(eq(companies.id, locals.user.companyId)).limit(1);
    ownCui = c?.cui ?? null;
  } catch { /* best-effort */ }

  // 1) PDF text layer — no AI.
  if (isPdf) {
    try {
      const pdf = await parseExpensePdf(bytes, ownCui);
      if (pdf.ok) return json({ ok: true, fields: pdf.fields, source: 'pdf-text' });
    } catch { /* fall through */ }
  } else {
    // 2) Image / photo → Tesseract OCR — no AI. Convert HEIC (iPhone) to JPEG first.
    let imgBytes = bytes;
    const brand = bytes.length > 12 ? String.fromCharCode(...bytes.slice(4, 12)) : '';
    const isHeic = mediaType === 'image/heic' || mediaType === 'image/heif'
      || (brand.startsWith('ftyp') && /heic|heix|mif1|heim|hevc|msf1/.test(brand));
    if (isHeic) {
      try {
        const { default: heicConvert } = await import('heic-convert');
        const out = await heicConvert({ buffer: Buffer.from(bytes) as any, format: 'JPEG', quality: 0.9 });
        imgBytes = new Uint8Array(out);
      } catch { /* keep original */ }
    }
    try {
      const img = await ocrImageExpense(imgBytes, ownCui);
      if (img.ok) return json({ ok: true, fields: img.fields, source: 'image-ocr' });
    } catch { /* fall through */ }
  }

  // 3) Claude vision — optional last resort (scanned PDF / hard photo).
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ ok: false, error: 'Nu am putut citi documentul automat. Completează manual sau încarcă XML-ul e-Factura.' });
  }
  const result = await ocrExpense(bytes, mediaType);
  return json(result);
};
