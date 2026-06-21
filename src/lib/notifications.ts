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

// Provider-agnostic email. Prefers SMTP (any provider: Brevo, Amazon SES,
// Zoho ZeptoMail, self-hosted Postfix — all pay-per-use / free-tier, no
// monthly lock-in) when SMTP_HOST is set; falls back to the Resend HTTP API
// when only RESEND_API_KEY is present. Configure ONE of:
//   SMTP_HOST, SMTP_PORT(=587), SMTP_USER, SMTP_PASS  + EMAIL_FROM
//   RESEND_API_KEY                                     + RESEND_FROM
const env = (k: string): string | undefined =>
  ((import.meta as any).env?.[k] as string | undefined) ?? process.env[k];

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const from = env('EMAIL_FROM') || env('SMTP_FROM') || env('RESEND_FROM') || 'facturamea <no-reply@facturamea.com>';
  const smtpHost = env('SMTP_HOST');

  // ── SMTP (preferred, provider-agnostic) ────────────────────────────────
  if (smtpHost) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(env('SMTP_PORT') || 587);
    const user = env('SMTP_USER');
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: user ? { user, pass: env('SMTP_PASS') } : undefined,
    });
    await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
    return;
  }

  // ── Resend HTTP API (fallback) ─────────────────────────────────────────
  const apiKey = env('RESEND_API_KEY');
  if (!apiKey) throw new Error('No email provider configured (set SMTP_HOST or RESEND_API_KEY)');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
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
