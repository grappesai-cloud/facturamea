import type { APIRoute } from 'astro';
import { requireRole } from '../../../lib/require-role';
import {
  parseTabular,
  autoMap,
  TARGET_FIELDS,
  MAX_IMPORT_ROWS,
  type ImportEntity,
  type ImportSource,
} from '../../../lib/import-parsers';

const VALID_SOURCES: ImportSource[] = ['oblio', 'smartbill', 'fgo', 'csv'];
const VALID_ENTITIES: ImportEntity[] = ['clients', 'products', 'invoices'];

const MAX_FILE_BYTES = 15 * 1024 * 1024;

// Parse an uploaded CSV/XLSX and return detected columns + a suggested mapping
// + a small preview. No DB writes — this is purely for the mapping step.
export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return new Response(JSON.stringify({ error: 'multipart/form-data invalid' }), { status: 400 });
  }

  const file = form.get('file') as File | null;
  const source = String(form.get('source') || 'csv') as ImportSource;
  const entity = String(form.get('entity') || 'clients') as ImportEntity;

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Fișier lipsă' }), { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return new Response(
      JSON.stringify({ error: `Fișier prea mare (maxim ${MAX_FILE_BYTES / 1024 / 1024} MB)` }),
      { status: 400 },
    );
  }
  if (!VALID_SOURCES.includes(source)) {
    return new Response(JSON.stringify({ error: 'Sursă necunoscută' }), { status: 400 });
  }
  if (!VALID_ENTITIES.includes(entity)) {
    return new Response(JSON.stringify({ error: 'Entitate necunoscută' }), { status: 400 });
  }

  let headers: string[];
  let rows: Record<string, string>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseTabular(buf, file.name);
    headers = parsed.headers;
    rows = parsed.rows;
  } catch (err) {
    console.error('import preview parse failed', err);
    return new Response(
      JSON.stringify({ error: 'Nu am putut citi fișierul. Verifică formatul (CSV sau XLSX).' }),
      { status: 400 },
    );
  }

  if (headers.length === 0) {
    return new Response(JSON.stringify({ error: 'Fișierul nu conține un antet de coloane.' }), {
      status: 400,
    });
  }

  const suggestedMapping = autoMap(headers, entity, source);
  const truncated = rows.length > MAX_IMPORT_ROWS;

  return new Response(
    JSON.stringify({
      headers,
      sample: rows.slice(0, 10),
      totalRows: rows.length,
      truncated,
      suggestedMapping,
      targetFields: TARGET_FIELDS[entity],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
