// Cron: emit recurring invoices that are due today.
// Triggered from vercel.json (cron schedule "0 7 * * *" — 07:00 UTC).
// Authorization: Bearer CRON_SECRET (matches the pattern of /cron/daily).

import type { APIRoute } from 'astro';
import { runRecurringInvoices } from '../../../lib/recurring-invoices';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const result = await runRecurringInvoices();
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
