import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { emailCampaigns } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../../../../lib/notifications';
import { logAction } from '../../../../lib/audit';
import { resolveAudience, wrapEmailHtml, type Audience } from '../../../../lib/email-campaign';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const VALID_AUDIENCES: Audience[] = ['all', 'trial', 'lifetime', 'custom'];

// Safety caps. A single send to more than this many recipients is truncated and
// flagged so we never accidentally blast the whole base in one click.
const MAX_SEND = 2000;
const CHUNK_SIZE = 20;

/** PATCH /api/admin/emailuri/:id : update draft fields. */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);
  const id = params.id;
  if (!id) return json({ error: 'ID lipsă' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalid' }, 400); }

  let existing: typeof emailCampaigns.$inferSelect | undefined;
  try {
    [existing] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
  } catch (err) {
    console.error('patch lookup failed', err);
    return json({ error: 'Baza de date indisponibilă' }, 500);
  }
  if (!existing) return json({ error: 'Campania nu există' }, 404);
  if (existing.status === 'sent' || existing.status === 'sending') {
    return json({ error: 'Campania a fost deja trimisă, nu mai poate fi editată' }, 409);
  }

  const patch: Record<string, unknown> = {};
  if (body.subject !== undefined) patch.subject = String(body.subject).slice(0, 300);
  if (body.html !== undefined) patch.html = String(body.html);
  if (body.preheader !== undefined) patch.preheader = body.preheader ? String(body.preheader).slice(0, 300) : null;
  if (body.audience !== undefined) {
    if (!VALID_AUDIENCES.includes(body.audience)) return json({ error: 'Audiență invalidă' }, 400);
    patch.audience = body.audience;
  }
  if (body.customRecipients !== undefined) patch.customRecipients = body.customRecipients ? String(body.customRecipients) : null;

  if (Object.keys(patch).length === 0) return json({ error: 'Nimic de actualizat' }, 400);

  try {
    await db.update(emailCampaigns).set(patch as any).where(eq(emailCampaigns.id, id));
  } catch (err) {
    console.error('patch update failed', err);
    return json({ error: 'Nu am putut actualiza schița' }, 500);
  }
  return json({ ok: true });
};

/**
 * POST /api/admin/emailuri/:id
 *   { action: 'test' }: send the wrapped campaign to the current admin's own email.
 *   { action: 'send' }: resolve audience and send to everyone, in batches.
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);
  const id = params.id;
  if (!id) return json({ error: 'ID lipsă' }, 400);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'JSON invalid' }, 400); }
  const action = body.action;

  let campaign: typeof emailCampaigns.$inferSelect | undefined;
  try {
    [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
  } catch (err) {
    console.error('campaign lookup failed', err);
    return json({ error: 'Baza de date indisponibilă' }, 500);
  }
  if (!campaign) return json({ error: 'Campania nu există' }, 404);

  const wrapped = wrapEmailHtml({
    subject: campaign.subject,
    preheader: campaign.preheader,
    bodyHtml: campaign.html,
  });

  // -------- TEST SEND --------
  if (action === 'test') {
    const to = locals.user.email;
    if (!to) return json({ error: 'Adresa ta de email lipsește' }, 400);
    try {
      await sendEmail(to, `[TEST] ${campaign.subject}`, stripHtml(campaign.html), wrapped);
    } catch (err) {
      console.error('test send failed', err);
      return json({ error: 'Trimiterea de test a eșuat: ' + msg(err) }, 502);
    }
    return json({ ok: true, sentTo: to });
  }

  // -------- CAMPAIGN SEND --------
  if (action === 'send') {
    if (campaign.status === 'sent') return json({ error: 'Campania a fost deja trimisă' }, 409);
    if (campaign.status === 'sending') return json({ error: 'Campania este deja în curs de trimitere' }, 409);

    const allRecipients = await resolveAudience(campaign.audience as Audience, campaign.customRecipients);
    if (allRecipients.length === 0) {
      return json({ error: 'Niciun destinatar pentru audiența selectată' }, 400);
    }

    let truncated = false;
    let recipients = allRecipients;
    if (recipients.length > MAX_SEND) {
      recipients = recipients.slice(0, MAX_SEND);
      truncated = true;
      console.warn(`email campaign ${id}: audience ${allRecipients.length} exceeds cap ${MAX_SEND}, truncating`);
    }

    // Mark as sending (guards against a concurrent double-click reaching this point).
    try {
      await db.update(emailCampaigns)
        .set({ status: 'sending', totalRecipients: recipients.length } as any)
        .where(eq(emailCampaigns.id, id));
    } catch (err) {
      console.error('mark sending failed', err);
      return json({ error: 'Nu am putut marca trimiterea' }, 500);
    }

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((r) => sendEmail(r.email, campaign!.subject, stripHtml(campaign!.html), wrapped)),
      );
      for (const res of results) {
        if (res.status === 'fulfilled') sentCount++;
        else { failedCount++; console.warn('campaign send failed:', res.reason); }
      }
    }

    const finalStatus = sentCount === 0 ? 'failed' : 'sent';
    try {
      await db.update(emailCampaigns)
        .set({
          status: finalStatus,
          sentCount,
          failedCount,
          totalRecipients: recipients.length,
          sentAt: new Date(),
        } as any)
        .where(eq(emailCampaigns.id, id));
    } catch (err) {
      console.error('finalize campaign failed', err);
    }

    await logAction({
      userId: locals.user.id,
      companyId: locals.user.companyId,
      action: 'admin.email_campaign_sent',
      entityType: 'email_campaign',
      entityId: id,
      metadata: { audience: campaign.audience, sentCount, failedCount, truncated, requested: allRecipients.length },
      request,
    });

    return json({
      ok: true,
      sentCount,
      failedCount,
      totalRecipients: recipients.length,
      status: finalStatus,
      truncated,
      ...(truncated ? { note: `Audiența avea ${allRecipients.length} destinatari; trimiterea a fost limitată la primii ${MAX_SEND}.` } : {}),
    });
  }

  return json({ error: 'Acțiune necunoscută' }, 400);
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
