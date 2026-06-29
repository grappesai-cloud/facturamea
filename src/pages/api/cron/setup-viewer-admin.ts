// TEMPORARY one-shot endpoint — adds users.admin_role column and grants the
// read-only "viewer" admin role to a chosen partner account (Robert György).
// Guarded by CRON_SECRET. DELETE this file after running.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

async function ensureColumn() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role varchar(20) NOT NULL DEFAULT 'full'`);
}

// GET → ensure column + list candidate accounts matching robert/gyorgy.
export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return json({ error: 'unauthorized' }, 401);
  try {
    await ensureColumn();
    const rows = await db.execute(sql`
      SELECT u.id, u.platform_id, u.email, u.name, u.is_admin, u.admin_role,
             u.company_id, c.name AS company_name, l.plan AS license_plan, l.status AS license_status
      FROM users u
      LEFT JOIN companies c ON c.id = u.company_id
      LEFT JOIN app_licenses l ON l.company_id = u.company_id
      WHERE lower(u.email) LIKE '%robert%' OR lower(u.email) LIKE '%gyorgy%'
         OR lower(u.name)  LIKE '%robert%' OR lower(u.name)  LIKE '%gyorgy%'
         OR lower(u.platform_id) LIKE '%robert%' OR lower(u.platform_id) LIKE '%gyorgy%'
      ORDER BY u.name
    `);
    return json({ columnReady: true, candidates: (rows as any).rows ?? rows });
  } catch (e: any) {
    return json({ error: e?.message || String(e), cause: e?.cause?.message }, 500);
  }
};

// POST { userId } → grant viewer admin to that account.
export const POST: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) return json({ error: 'unauthorized' }, 401);
  try {
    await ensureColumn();
    const { userId } = await request.json().catch(() => ({}));
    if (!userId) return json({ error: 'userId required' }, 400);
    await db.execute(sql`
      UPDATE users SET is_admin = true, admin_role = 'viewer', updated_at = now()
      WHERE id = ${userId}
    `);
    const rows = await db.execute(sql`
      SELECT id, platform_id, email, name, is_admin, admin_role, totp_enabled
      FROM users WHERE id = ${userId}
    `);
    const user = ((rows as any).rows ?? rows)[0];
    if (!user) return json({ error: 'user not found after update' }, 404);
    return json({ ok: true, user });
  } catch (e: any) {
    return json({ error: e?.message || String(e), cause: e?.cause?.message }, 500);
  }
};
