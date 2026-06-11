// GET /api/anaf/inbox — list received e-Factura rows for the current company.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { efacturaInbox } from '../../../../db/schema';
import { eq, desc } from 'drizzle-orm';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ ok: false, error: 'Neautentificat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ ok: false, error: 'Fără firmă' }, 400);

  try {
    const rows = await db.select().from(efacturaInbox)
      .where(eq(efacturaInbox.companyId, companyId))
      .orderBy(desc(efacturaInbox.receivedAt), desc(efacturaInbox.createdAt))
      .limit(300);
    return json({ ok: true, rows });
  } catch {
    // DB not provisioned — return an empty list rather than 500.
    return json({ ok: true, rows: [] });
  }
};
