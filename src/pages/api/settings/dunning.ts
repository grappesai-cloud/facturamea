// GET/POST the company's dunning (payment reminders) preference.
//   GET  -> { enabled }
//   POST { enabled } -> updates companies.dunningEnabled  (owner/admin only)
//   POST { runNow:true } -> runs runReminders() for the current company now
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { companies } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { runReminders } from '../../../lib/dunning';
import { requireRole } from '../../../lib/require-role';

export const GET: APIRoute = async ({ locals }) => {
  const cid = locals.user?.companyId;
  if (!cid) {
    return new Response(JSON.stringify({ enabled: false }), { headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const [co] = await db.select({ enabled: companies.dunningEnabled }).from(companies).where(eq(companies.id, cid)).limit(1);
    return new Response(JSON.stringify({ enabled: !!co?.enabled }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ enabled: false }), { headers: { 'Content-Type': 'application/json' } });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const cid = locals.user?.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;

  const body = await request.json().catch(() => ({})) as any;

  // Manual trigger: send reminders now for this company.
  if (body.runNow) {
    try {
      const res = await runReminders(cid);
      return new Response(JSON.stringify({ ok: true, sent: res.sent, summary: res }), { headers: { 'Content-Type': 'application/json' } });
    } catch {
      return new Response(JSON.stringify({ ok: false, sent: 0, error: 'Nu am putut trimite remindere acum.' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }

  const enabled = !!body.enabled;
  try {
    await db.update(companies).set({ dunningEnabled: enabled }).where(eq(companies.id, cid));
  } catch {
    return new Response(JSON.stringify({ error: 'Eroare la salvare' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, enabled }), { headers: { 'Content-Type': 'application/json' } });
};
