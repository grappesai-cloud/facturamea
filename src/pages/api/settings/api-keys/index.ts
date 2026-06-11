import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { apiKeys } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateApiKey } from '../../../../lib/api-keys';

// GET /api/settings/api-keys — list this company's keys. Never returns keyHash.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const companyId = locals.user.companyId;
  if (!companyId) return new Response(JSON.stringify({ keys: [] }), { headers: { 'Content-Type': 'application/json' } });

  try {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        mode: apiKeys.mode,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
    return new Response(JSON.stringify({ keys: rows }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    // DB not provisioned — render an empty list rather than 500.
    return new Response(JSON.stringify({ keys: [] }), { headers: { 'Content-Type': 'application/json' } });
  }
};

// POST /api/settings/api-keys — create a key. Returns the RAW value ONCE.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const companyId = locals.user.companyId;
  if (!companyId) return new Response(JSON.stringify({ error: 'Configurează-ți firma înainte de a genera chei API.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  let body: any = {};
  try { body = await request.json(); } catch { body = {}; }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return new Response(JSON.stringify({ error: 'Numele cheii este obligatoriu.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  const mode: 'live' | 'test' = body?.mode === 'test' ? 'test' : 'live';

  try {
    const { raw, hash, prefix } = generateApiKey(mode);
    const id = nanoid();
    await db.insert(apiKeys).values({
      id,
      companyId,
      name,
      prefix,
      keyHash: hash,
      mode,
      createdByUserId: locals.user.id,
    });
    // The raw key is returned exactly once; we only persist its hash.
    return new Response(JSON.stringify({ id, name, prefix, mode, key: raw }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la generarea cheii.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
