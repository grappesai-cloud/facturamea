// Shared helpers for the public developer API (v1). Kept separate from
// `api-keys.ts` (which the prompt provides) so route files stay thin. Every v1
// route authenticates with `requireApiKey` and replies in JSON.
import { apiJson } from './api-keys';

// 400 — invalid request body / params.
export function apiBadRequest(message: string, details?: unknown): Response {
  return apiJson({ error: 'bad_request', message, ...(details ? { details } : {}) }, 400);
}

// 404 — resource not found (or not owned by the authenticated company).
export function apiNotFound(message = 'Resursa nu a fost găsită.'): Response {
  return apiJson({ error: 'not_found', message }, 404);
}

// 500 — unexpected server / DB error. v1 routes wrap DB access in try/catch
// (no DB is connected in this environment) and return this on failure.
export function apiServerError(message = 'Eroare internă. Încearcă din nou.'): Response {
  return apiJson({ error: 'server_error', message }, 500);
}

// Safely parse a JSON request body. Returns `null` on empty / malformed input
// so callers can answer with `apiBadRequest`.
export async function readJson(request: Request): Promise<Record<string, any> | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}

// Parse `?limit=&offset=` with sane defaults + bounds.
export function parsePaging(url: URL, defaultLimit = 50, maxLimit = 200): { limit: number; offset: number } {
  let limit = Number.parseInt(url.searchParams.get('limit') || '', 10);
  let offset = Number.parseInt(url.searchParams.get('offset') || '', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

// Coerce a value to a trimmed non-empty string, or null.
export function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

// Coerce a value to an integer (cents), returning null when it isn't a finite number.
export function asInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

// Coerce a value to a finite number, returning null otherwise.
export function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
