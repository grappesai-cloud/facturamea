import type { APIRoute } from 'astro';
import { resolveAudience, type Audience } from '../../../../lib/email-campaign';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_AUDIENCES: Audience[] = ['all', 'trial', 'lifetime', 'custom'];

/**
 * GET /api/admin/emailuri/audience-count?audience=...&customRecipients=...
 * Returns the resolved recipient count so the composer can show the audience size.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);
  const audience = (url.searchParams.get('audience') || 'all') as Audience;
  if (!VALID_AUDIENCES.includes(audience)) return json({ error: 'Audiență invalidă' }, 400);
  const custom = url.searchParams.get('customRecipients') || undefined;
  const recipients = await resolveAudience(audience, custom);
  return json({ count: recipients.length });
};

/** POST variant: for long custom lists that would overflow a query string. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalid' }, 400); }
  const audience = (body.audience || 'all') as Audience;
  if (!VALID_AUDIENCES.includes(audience)) return json({ error: 'Audiență invalidă' }, 400);
  const recipients = await resolveAudience(audience, body.customRecipients || undefined);
  return json({ count: recipients.length });
};
