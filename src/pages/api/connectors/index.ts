import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { integrationConnections } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { requireRole } from '../../../lib/require-role';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_PROVIDERS = ['woocommerce', 'shopify', 'prestashop', 'custom'];

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ results: [] });

  try {
    const results = await db
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.provider,
        label: integrationConnections.label,
        baseUrl: integrationConnections.baseUrl,
        webhookSecret: integrationConnections.webhookSecret,
        autoInvoice: integrationConnections.autoInvoice,
        isActive: integrationConnections.isActive,
        lastEventAt: integrationConnections.lastEventAt,
        createdAt: integrationConnections.createdAt,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.companyId, cid))
      .orderBy(desc(integrationConnections.createdAt))
      .limit(100);
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

    const id = nanoid();
    const webhookSecret = nanoid(32);

    await db.insert(integrationConnections).values({
      id,
      companyId: cid,
      provider,
      label,
      baseUrl,
      webhookSecret,
      autoInvoice: true,
      isActive: true,
    });

    return json({ id, provider, label, webhookSecret, autoInvoice: true, isActive: true }, 201);
  } catch {
    return json({ error: 'Eroare la salvare' }, 500);
  }
};
