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

// Email delivery. Prefers HTTP APIs over HTTPS (443) — the ONLY reliable path
// on hosts (Netcup) that filter outbound SMTP ports (25/587). Order:
//   1. Brevo HTTP API   (BREVO_API_KEY)   — recommended, free 300/day
//   2. Resend HTTP API  (RESEND_API_KEY)
//   3. SMTP             (SMTP_HOST...)     — last resort, with short timeouts so
//      a blocked port fails fast instead of hanging the request.
// Sender from EMAIL_FROM ("Name <email>") / RESEND_FROM.
const env = (k: string): string | undefined =>
  ((import.meta as any).env?.[k] as string | undefined) ?? process.env[k];

function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: m[1] || 'facturamea', email: m[2] };
  return { name: 'facturamea', email: from.trim() };
}

async function fetchJson(url: string, init: RequestInit, label: string): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${label} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } finally {
    clearTimeout(t);
  }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const from = env('EMAIL_FROM') || env('SMTP_FROM') || env('RESEND_FROM') || 'facturamea <no-reply@facturamea.com>';

  // ── Brevo HTTP API (preferred — works over 443, no SMTP port needed) ─────
  const brevoKey = env('BREVO_API_KEY');
  if (brevoKey) {
    const sender = parseFrom(from);
    await fetchJson('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html || `<pre>${text}</pre>`, textContent: text }),
    }, 'Brevo');
    return;
  }

  // ── Resend HTTP API ──────────────────────────────────────────────────────
  const resendKey = env('RESEND_API_KEY');
  if (resendKey) {
    await fetchJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }),
    }, 'Resend');
    return;
  }

  // ── SMTP (last resort, fail-fast timeouts so a blocked port can't hang) ──
  const smtpHost = env('SMTP_HOST');
  if (!smtpHost) throw new Error('No email provider configured (set BREVO_API_KEY, RESEND_API_KEY, or SMTP_HOST)');
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(env('SMTP_PORT') || 587);
  const user = env('SMTP_USER');
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: port === 465,
    auth: user ? { user, pass: env('SMTP_PASS') } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
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
