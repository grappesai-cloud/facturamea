import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { emailCampaigns, users } from '../../../../db/schema';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { logAction } from '../../../../lib/audit';
import { resolveAudience, type Audience } from '../../../../lib/email-campaign';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_AUDIENCES: Audience[] = ['all', 'trial', 'lifetime', 'custom'];

/**
 * GET /api/admin/emailuri
 *   - default: list campaigns (newest first)
 *   - ?count=1&audience=...&customRecipients=...: resolved recipient count only
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);

  if (url.searchParams.get('count') === '1') {
    const audience = (url.searchParams.get('audience') || 'all') as Audience;
    if (!VALID_AUDIENCES.includes(audience)) return json({ error: 'Audiență invalidă' }, 400);
    const custom = url.searchParams.get('customRecipients') || undefined;
    const recipients = await resolveAudience(audience, custom);
    return json({ count: recipients.length });
  }

  try {
    const rows = await db
      .select({
        id: emailCampaigns.id,
        subject: emailCampaigns.subject,
        audience: emailCampaigns.audience,
        status: emailCampaigns.status,
        totalRecipients: emailCampaigns.totalRecipients,
        sentCount: emailCampaigns.sentCount,
        failedCount: emailCampaigns.failedCount,
        createdAt: emailCampaigns.createdAt,
        sentAt: emailCampaigns.sentAt,
        createdByName: users.name,
      })
      .from(emailCampaigns)
      .leftJoin(users, eq(emailCampaigns.createdByAdminId, users.id))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(50);
    return json({ campaigns: rows });
  } catch (err) {
    console.error('list campaigns failed', err);
    return json({ campaigns: [] });
  }
};

/** POST /api/admin/emailuri : create a draft. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalid' }, 400); }

  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const preheader = body.preheader ? String(body.preheader).trim().slice(0, 300) : null;
  const audience = (body.audience || 'all') as Audience;
  const customRecipients = body.customRecipients ? String(body.customRecipients) : null;

  if (!subject) return json({ error: 'Subiectul este obligatoriu' }, 400);
  if (!html) return json({ error: 'Conținutul HTML este obligatoriu' }, 400);
  if (!VALID_AUDIENCES.includes(audience)) return json({ error: 'Audiență invalidă' }, 400);

  const id = nanoid();
  try {
    await db.insert(emailCampaigns).values({
      id,
      subject: subject.slice(0, 300),
      html,
      preheader,
      audience,
      customRecipients,
      status: 'draft',
      createdByAdminId: locals.user.id,
    } as any);
  } catch (err) {
    console.error('create draft failed', err);
    return json({ error: 'Nu am putut salva schița (baza de date indisponibilă?)' }, 500);
  }

  await logAction({
    userId: locals.user.id,
    companyId: locals.user.companyId,
    action: 'admin.email_campaign_created',
    entityType: 'email_campaign',
    entityId: id,
    metadata: { audience },
    request,
  });

  return json({ ok: true, id });
};
