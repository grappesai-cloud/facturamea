import type { APIRoute } from 'astro';
import { isCronAuthorized } from '../../../lib/cron-auth';
import { refreshExpiringTokens } from '../../../lib/anaf/tokens';
import { syncEfacturaStatuses } from '../../../lib/anaf/efactura-sync';

// Frequent e-Factura status sync. Re-polls ANAF for invoices still in 'submitted'
// and moves them to validated/rejected, so a rejection surfaces within minutes
// instead of waiting for the daily cron. Wire as a Coolify scheduled task
// (e.g. every 15-30 min). Guarded by CRON_SECRET.
export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await refreshExpiringTokens().catch(() => {});
    const r = await syncEfacturaStatuses();
    return new Response(JSON.stringify({ ok: true, ...r }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
