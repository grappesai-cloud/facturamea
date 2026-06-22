import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { users, sessions, passwordResetTokens, emailVerificationTokens, companies } from '../../../db/schema';
import { inArray, notInArray } from 'drizzle-orm';

// One-time cleanup: removes ALL accounts except the kept ones (demo + admin).
// Guarded by CRON_SECRET. Order matters: delete victim companies first (cascade
// wipes their invoices/clients/etc. across the company-scoped tables), then the
// victim users' auth rows, then the users themselves.
//   GET /api/cron/cleanup-users?secret=<CRON_SECRET>
const KEEP_EMAILS = ['demo@facturamea.com', 'grappes.ai@gmail.com'];

export const GET: APIRoute = async ({ url }) => {
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  const dry = url.searchParams.get('dry') === '1';

  try {
    const kept = await db.select({ id: users.id, companyId: users.companyId }).from(users).where(inArray(users.email, KEEP_EMAILS));
    const keptUserIds = kept.map((k) => k.id);
    const keptCompanyIds = kept.map((k) => k.companyId).filter(Boolean) as string[];

    if (keptUserIds.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'kept accounts not found — aborting', KEEP_EMAILS }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const victims = await db.select({ id: users.id, email: users.email }).from(users).where(notInArray(users.id, keptUserIds));
    const victimUserIds = victims.map((v) => v.id);

    if (dry) {
      return new Response(JSON.stringify({ ok: true, dryRun: true, kept: kept, keptCompanyIds, victimsCount: victims.length, victims: victims.map((v) => v.email) }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }

    // 1) victim companies → cascade wipes all company-scoped data.
    if (keptCompanyIds.length) {
      await db.delete(companies).where(notInArray(companies.id, keptCompanyIds));
    }

    // 2) victim users' auth rows (these reference user, not company).
    if (victimUserIds.length) {
      await db.delete(sessions).where(inArray(sessions.userId, victimUserIds));
      await db.delete(passwordResetTokens).where(inArray(passwordResetTokens.userId, victimUserIds));
      await db.delete(emailVerificationTokens).where(inArray(emailVerificationTokens.userId, victimUserIds));
      // 3) the users themselves.
      await db.delete(users).where(inArray(users.id, victimUserIds));
    }

    const remaining = await db.select({ email: users.email }).from(users);
    return new Response(JSON.stringify({ ok: true, deletedUsers: victimUserIds.length, remaining: remaining.map((r) => r.email) }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    const cause = e?.cause || e;
    return new Response(JSON.stringify({
      ok: false,
      error: e?.message || 'error',
      pgDetail: String(cause?.detail || ''),
      pgTable: String(cause?.table || ''),
      pgConstraint: String(cause?.constraint || ''),
      pgCode: String(cause?.code || ''),
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
