import { db } from '../db';
import { notifications, notificationPreferences, users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type NotificationType =
  | 'auction_bid'
  | 'auction_won'
  | 'auction_lost'
  | 'auction_awarded'
  | 'order_status'
  | 'message'
  | 'freight_match'
  | 'truck_match'
  | 'incident'
  | 'rating'
  | 'invoice'
  | 'system';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
  entityType?: string;
  entityId?: string;
  // When true, attempt to send email via Resend in addition to in-app.
  email?: boolean;
  // Optional pre-rendered HTML email body (from email-templates.ts). If provided
  // it overrides the default plaintext-only email built from title+body.
  emailHtml?: string;
  emailSubject?: string;
}

function shouldSend(
  prefs: { emailEnabled: boolean | null; inAppEnabled: boolean | null; typeOverrides: string | null } | null,
  type: NotificationType,
  channel: 'inApp' | 'email',
): boolean {
  if (!prefs) return true;
  const master = channel === 'email' ? (prefs.emailEnabled ?? true) : (prefs.inAppEnabled ?? true);
  if (!master) return false;
  if (!prefs.typeOverrides) return true;
  try {
    const overrides = JSON.parse(prefs.typeOverrides) as Record<string, { email?: boolean; inApp?: boolean }>;
    const o = overrides[type];
    if (!o) return true;
    return channel === 'email' ? (o.email ?? true) : (o.inApp ?? true);
  } catch {
    return true;
  }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: import.meta.env.RESEND_FROM || process.env.RESEND_FROM || 'facturamea <no-reply@send.facturamea.com>',
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend error ${res.status}: ${errText}`);
  }
}

/** Strip a trailing http(s) URL from a notification body — the in-app row
 *  is already a clickable link via linkUrl, so the bare URL becomes noise. */
function cleanInAppBody(body: string | undefined | null, hasLinkUrl: boolean): string | undefined {
  if (!body) return body ?? undefined;
  if (!hasLinkUrl) return body;
  // Remove the last URL plus any leading "Vezi:"/"View:"/space/punctuation
  return body.replace(/\s*(?:Vezi|View|See|Open):?\s*https?:\/\/\S+\.?$/i, '')
             .replace(/\s+https?:\/\/\S+\.?$/, '')
             .trim();
}

export async function notify(input: NotifyInput): Promise<string> {
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, input.userId));
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, input.userId));

  const id = nanoid();
  const wantsInApp = shouldSend(prefs, input.type, 'inApp');
  if (wantsInApp) {
    await db.insert(notifications).values({
      id,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: cleanInAppBody(input.body, !!input.linkUrl),
      linkUrl: input.linkUrl,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  if (input.email && user?.email && shouldSend(prefs, input.type, 'email')) {
    try {
      await sendEmail(
        user.email,
        input.emailSubject ?? input.title,
        input.body || input.title,
        input.emailHtml,
      );
      if (wantsInApp) {
        await db.update(notifications)
          .set({ emailSentAt: new Date() })
          .where(eq(notifications.id, id));
      }
    } catch (err) {
      console.error('Email send failed:', err);
      if (wantsInApp) {
        await db.update(notifications)
          .set({ emailError: String(err instanceof Error ? err.message : err) })
          .where(eq(notifications.id, id));
      }
    }
  }

  return id;
}
