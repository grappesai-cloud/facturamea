import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { integrationConnections } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { requireRole } from '../../../lib/require-role';
import { sealEmagCreds } from '../../../lib/emag';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_PROVIDERS = ['woocommerce', 'shopify', 'prestashop', 'emag', 'custom'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ results: [] });

  try {
    const rows = await db
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.provider,
        label: integrationConnections.label,
        baseUrl: integrationConnections.baseUrl,
        webhookSecret: integrationConnections.webhookSecret,
        configEnc: integrationConnections.configEnc,
        autoInvoice: integrationConnections.autoInvoice,
        isActive: integrationConnections.isActive,
        lastEventAt: integrationConnections.lastEventAt,
        createdAt: integrationConnections.createdAt,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, cid))
      .orderBy(desc(integrationConnections.createdAt))
      .limit(100);
    // Never leak the encrypted credentials — expose only whether they're set.
    const results = rows.map(({ configEnc, ...c }) => ({ ...c, hasCreds: !!configEnc }));
    return json({ results });
  } catch {
    return json({ results: [] });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);

  try {
    const body = await request.json().catch(() => ({}));
    const provider = String(body?.provider || '').toLowerCase().trim();
    if (!VALID_PROVIDERS.includes(provider)) {
      return json({ error: 'Provider invalid' }, 400);
    }
    const label = String(body?.label || '').trim().slice(0, 120) || null;
    const baseUrl = String(body?.baseUrl || '').trim().slice(0, 500) || null;

    // eMag is pull-based and needs Marketplace API credentials (not a webhook).
    // Store them encrypted in config_enc; never persist them in plaintext.
    let configEnc: string | null = null;
    if (provider === 'emag') {
      const cfg = body?.config || {};
      const username = String(cfg.username || '').trim();
      const password = String(cfg.password || '').trim();
      const platform = String(cfg.platform || 'ro').toLowerCase().trim();
      if (!username || !password) {
        return json({ error: 'eMag are nevoie de utilizator și parolă API Marketplace' }, 400);
      }
      try {
        configEnc = sealEmagCreds({ username, password, platform });
      } catch {
        return json({ error: 'Cheia de criptare nu e configurată pe server' }, 500);
      }
    }

    const id = nanoid();
    const webhookSecret = nanoid(32);

    await db.insert(integrationConnections).values({
      id,
      companyId: cid,
      provider,
      label,
      baseUrl,
      webhookSecret,
      configEnc,
      autoInvoice: true,
      isActive: true,
    });

    return json({ id, provider, label, webhookSecret, autoInvoice: true, isActive: true, hasCreds: !!configEnc }, 201);
  } catch {
    return json({ error: 'Eroare la salvare' }, 500);
  }
};
