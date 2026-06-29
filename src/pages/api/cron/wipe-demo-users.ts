import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { db } from '../../../db';
import { users, companies, userCompanyMemberships } from '../../../db/schema';
import { and, eq, notInArray, inArray, ilike } from 'drizzle-orm';

// TEMP one-shot: remove the seed/test users whose primary company is "Demo Studio
// SRL", KEEPING the App Store / Play review account + the generic demo login.
// GET = dry-run (list who would be deleted). GET ?do=delete = actually delete.
// Guarded by CRON_SECRET. Remove after.
const KEEP_EMAILS = ['apple.review@facturamea.com', 'demo@facturamea.com'];

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const doDelete = new URL(request.url).searchParams.get('do') === 'delete';

  // Find Demo Studio SRL (by name; fall back to CUI fragment).
  const [co] = await db.select({ id: companies.id, name: companies.name })
    .from(companies).where(ilike(companies.name, '%Demo Studio SRL%')).limit(1);
  if (!co) return new Response(JSON.stringify({ error: 'Demo Studio SRL negăsit' }), { status: 404, headers: { 'Content-Type': 'application/json' } });

  const targets = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.companyId, co.id), notInArray(users.email, KEEP_EMAILS)));

  if (!doDelete) {
    return new Response(JSON.stringify({
      dryRun: true, company: co, count: targets.length,
      kept: KEEP_EMAILS,
      users: targets.map((u) => ({ email: u.email, name: u.name })),
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const ids = targets.map((u) => u.id);
  let affected = 0;
  if (ids.length) {
    try {
      // Hard delete is blocked by ~15 RESTRICT FKs (auth + activity tables). The
      // safe, reversible equivalent (what the admin panel does) is deactivation:
      // the test users vanish from the active list and can no longer sign in.
      // Their Demo-Studio-SRL membership rows are also removed.
      await db.delete(userCompanyMemberships).where(inArray(userCompanyMemberships.userId, ids));
      const res: any = await db.update(users).set({ isActive: false }).where(inArray(users.id, ids));
      affected = res?.rowCount ?? ids.length;
    } catch (e: any) {
      return new Response(JSON.stringify({ ok: false, error: e?.message || String(e), attempted: ids.length }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return new Response(JSON.stringify({ ok: true, mode: 'deactivated', company: co.name, deactivated: affected, kept: KEEP_EMAILS }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
