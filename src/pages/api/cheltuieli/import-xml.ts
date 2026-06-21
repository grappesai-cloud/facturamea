// POST /api/cheltuieli/import-xml — FREE invoice ingestion from an e-Factura
// UBL XML (or the ANAF ZIP). No AI / no cost. Returns the same field shape as
// /api/cheltuieli/ocr so the confirm-then-save UI is shared. Does NOT create
// the expense — the user confirms first.
//
// Multipart form-data: field `file` (.xml or .zip, max 8 MB).
import type { APIRoute } from 'astro';
import { extractInvoiceXml, parseEfacturaXml } from '../../../lib/efactura-parse';
import { requireRole } from '../../../lib/require-role';

const MAX_BYTES = 8 * 1024 * 1024;

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
  if (file.size > MAX_BYTES) return json({ ok: false, error: 'Fișier prea mare (max 8 MB).' }, 400);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return json({ ok: false, error: 'Nu am putut citi fișierul.' }, 400);
  }

  const xml = extractInvoiceXml(bytes);
  if (!xml) return json({ ok: false, error: 'Nu am găsit un XML de factură în fișier (acceptă .xml sau ZIP-ul de la ANAF).' });

  const result = parseEfacturaXml(xml);
  // 200 with ok:false on a bad file — UI handles it gracefully (parity with /ocr).
  return json(result);
};
