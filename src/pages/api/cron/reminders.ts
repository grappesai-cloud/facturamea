import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { runReminders } from '../../../lib/dunning';

// facturamea — dunning cron. Sends due payment reminders for every company
// with dunningEnabled. Scheduled in vercel.json by the orchestrator.
// Authorized via CRON_SECRET (same gate as the other /api/cron/* routes).
export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0;
  let summary: any = null;
  try {
    const res = await runReminders();
    sent = res.sent;
    summary = res;
  } catch {
    // Never let the cron hard-fail.
  }

  return new Response(JSON.stringify({ ok: true, sent, summary, ranAt: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
