import crypto from 'node:crypto';
import { db } from '../db';
import { apiKeys } from '../db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { licenseState } from './license';
import { rateLimitAsync } from './security';

// Generate a new API key. The raw value is returned ONCE; we persist only the
// sha256 hash + a short visible prefix.
export function generateApiKey(mode: 'live' | 'test' = 'live') {
  const raw = `fm_${mode}_${nanoid(36)}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 14); // e.g. fm_live_AbCd12
  return { raw, hash, prefix, mode };
}

export function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Resolve a Bearer token to its owning company. Returns null on missing /
// invalid / revoked key. Touches lastUsedAt fire-and-forget.
export async function requireApiKey(
  request: Request,
  opts: { write?: boolean; scope?: string } = {},
): Promise<{ companyId: string; keyId: string; mode: string } | null> {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = m?.[1]?.trim();
  if (!token) return null;
  try {
    const hash = hashKey(token);
    const [k] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)));
    if (!k) return null;

    // Per-key rate limit (the IP-based middleware limit doesn't cover GETs).
    const rl = await rateLimitAsync(`apikey:${k.id}`, opts.write ? 60 : 120, 60_000);
    if (!rl.allowed) return null;

    // License gate: the company must hold an active paid license to use the API
    // (otherwise the v1/Bearer path bypasses the paywall like /api/ once did).
    try { const st = await licenseState(k.companyId); if (!st.active) return null; } catch { /* DB hiccup → don't lock out */ }

    // Scopes: null = all scopes. If a specific scope is required, enforce it.
    if (opts.scope && k.scopes) {
      try { const arr = JSON.parse(k.scopes); if (Array.isArray(arr) && !arr.includes(opts.scope)) return null; } catch { /* malformed → treat as all */ }
    }

    // Test-mode keys are READ-ONLY — they must never burn a live fiscal series
    // number or post a real document.
    if (opts.write && k.mode === 'test') return null;

    db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, k.id)).catch(() => {});
    return { companyId: k.companyId, keyId: k.id, mode: k.mode };
  } catch {
    return null;
  }
}

// Standard 401 for v1 routes.
export function apiUnauthorized(): Response {
  return new Response(JSON.stringify({ error: 'unauthorized', message: 'Cheie API lipsă sau invalidă. Trimite header Authorization: Bearer <cheie>.' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' },
  });
}

export function apiJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
