// Token store + auto-refresh. The single entry-point for any code that
// needs to call an ANAF private API: getValidAccessToken(companyId, scope).
import { db, anafConnections } from '../../db';
import { eq, and, isNull } from 'drizzle-orm';
import { encrypt, decrypt } from './crypto';
import { refreshAccessToken, revokeToken, type OAuthTokens } from './oauth';
import type { AnafScope } from './config';
import { nanoid } from 'nanoid';

// Refresh proactively if access token expires in <2 days. This keeps
// the daily cron from being a hard dependency for staying connected.
const ACCESS_REFRESH_THRESHOLD_MS = 2 * 86400 * 1000;

export interface SaveOpts {
  companyId: string;
  userId: string;
  scope: AnafScope;
  cif?: string | null;
  tokens: OAuthTokens;
}

export async function saveConnection(opts: SaveOpts): Promise<void> {
  const now = new Date();
  const row = {
    id: nanoid(),
    companyId: opts.companyId,
    scope: opts.scope,
    cif: opts.cif ?? null,
    accessTokenEnc: encrypt(opts.tokens.accessToken),
    refreshTokenEnc: encrypt(opts.tokens.refreshToken),
    accessExpiresAt: opts.tokens.accessExpiresAt,
    refreshExpiresAt: opts.tokens.refreshExpiresAt,
    connectedByUserId: opts.userId,
    connectedAt: now,
    lastRefreshedAt: now,
    revokedAt: null,
  };
  // Upsert on (company_id, scope) — re-connecting replaces the row.
  await db.insert(anafConnections).values(row).onConflictDoUpdate({
    target: [anafConnections.companyId, anafConnections.scope],
    set: {
      cif: row.cif,
      accessTokenEnc: row.accessTokenEnc,
      refreshTokenEnc: row.refreshTokenEnc,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
      connectedByUserId: row.connectedByUserId,
      connectedAt: row.connectedAt,
      lastRefreshedAt: row.lastRefreshedAt,
      revokedAt: null,
    },
  });
}

export async function getConnection(companyId: string, scope: AnafScope) {
  const [row] = await db.select().from(anafConnections)
    .where(and(
      eq(anafConnections.companyId, companyId),
      eq(anafConnections.scope, scope),
      isNull(anafConnections.revokedAt),
    ))
    .limit(1);
  return row || null;
}

export async function listConnections(companyId: string) {
  return db.select().from(anafConnections)
    .where(and(eq(anafConnections.companyId, companyId), isNull(anafConnections.revokedAt)));
}

export async function getValidAccessToken(companyId: string, scope: AnafScope): Promise<string> {
  const conn = await getConnection(companyId, scope);
  if (!conn) throw new Error(`ANAF nu este conectat pentru ${scope}. Conectează-te din Setări → Integrări ANAF.`);

  const now = Date.now();
  const accessAge = conn.accessExpiresAt.getTime() - now;

  // Mark as recently used (best-effort).
  void db.update(anafConnections).set({ lastUsedAt: new Date() }).where(eq(anafConnections.id, conn.id)).catch(() => {});

  if (accessAge > ACCESS_REFRESH_THRESHOLD_MS) {
    return decrypt(conn.accessTokenEnc);
  }

  // Refresh token has its own expiry — if that's also dead, the user
  // must reconnect (re-auth with the cert).
  if (conn.refreshExpiresAt.getTime() <= now) {
    throw new Error(`Sesiunea ANAF (${scope}) a expirat. Reconectează din Setări → Integrări ANAF.`);
  }

  // Try refresh.
  let refreshed: OAuthTokens;
  try {
    refreshed = await refreshAccessToken(decrypt(conn.refreshTokenEnc));
  } catch (err) {
    throw new Error(`Refresh ANAF eșuat (${scope}): ${err instanceof Error ? err.message : 'eroare necunoscută'}. Reconectează.`);
  }

  await db.update(anafConnections).set({
    accessTokenEnc: encrypt(refreshed.accessToken),
    refreshTokenEnc: encrypt(refreshed.refreshToken),
    accessExpiresAt: refreshed.accessExpiresAt,
    refreshExpiresAt: refreshed.refreshExpiresAt,
    lastRefreshedAt: new Date(),
  }).where(eq(anafConnections.id, conn.id));

  return refreshed.accessToken;
}

export async function revokeConnection(companyId: string, scope: AnafScope): Promise<void> {
  const conn = await getConnection(companyId, scope);
  if (!conn) return;
  try { await revokeToken(decrypt(conn.refreshTokenEnc), 'refresh_token'); } catch {}
  await db.update(anafConnections).set({ revokedAt: new Date() }).where(eq(anafConnections.id, conn.id));
}

// Cron entry-point: refresh anything expiring soon.
export async function refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
  const all = await db.select().from(anafConnections).where(isNull(anafConnections.revokedAt));
  let refreshed = 0, failed = 0;
  const now = Date.now();
  for (const conn of all) {
    if (conn.accessExpiresAt.getTime() - now > 7 * 86400 * 1000) continue;
    if (conn.refreshExpiresAt.getTime() <= now) continue;
    try {
      const t = await refreshAccessToken(decrypt(conn.refreshTokenEnc));
      await db.update(anafConnections).set({
        accessTokenEnc: encrypt(t.accessToken),
        refreshTokenEnc: encrypt(t.refreshToken),
        accessExpiresAt: t.accessExpiresAt,
        refreshExpiresAt: t.refreshExpiresAt,
        lastRefreshedAt: new Date(),
      }).where(eq(anafConnections.id, conn.id));
      refreshed++;
    } catch {
      failed++;
    }
  }
  return { refreshed, failed };
}
