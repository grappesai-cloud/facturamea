// POST /api/cheltuieli/ocr — extract structured fields from an uploaded
// receipt/invoice (image or PDF) via Claude vision. Does NOT create the
// expense; the scan UI lets the user confirm the fields first.
//
// Multipart form-data: field `file` (image/* or application/pdf).
// Returns { ok:true, fields } or { ok:false, error }. Never 500s on a bad image.
import type { APIRoute } from 'astro';
import { ocrExpense } from '../../../lib/expense-ocr';
import { requireRole } from '../../../lib/require-role';

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB cap — keeps requests well under limits.

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ ok: false, error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const denied = requireRole(locals, 'expense.manage'); if (denied) return denied;
  if (!locals.user.companyId) {
    return new Response(JSON.stringify({ ok: false, error: 'Companie lipsă' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Early, explicit 503 when the model isn't configured — clearer than a generic error.
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Scanarea automată nu este disponibilă momentan (lipsește configurarea AI).' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Cerere invalidă.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Niciun fișier încărcat.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: 'Fișier prea mare (max 12 MB).' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Nu am putut citi fișierul.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const mediaType = (file.type || '').toLowerCase();
  const result = await ocrExpense(bytes, mediaType);

  // Guarded: 200 with ok:false on a bad image (UI handles it gracefully).
  const status = result.ok ? 200 : (process.env.ANTHROPIC_API_KEY ? 200 : 503);
  return new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } });
};
