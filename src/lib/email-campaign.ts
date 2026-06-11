import { db } from '../db';
import { users, appLicenses } from '../db/schema';
import { and, eq, isNull, isNotNull, ne } from 'drizzle-orm';

// Brand palette (inlined everywhere; email clients strip <style> blocks).
const ORANGE = '#FF5C00';
const INK = '#0A0A0A';
const CREAM = '#FAFAF8';
const MUTED = '#6B6B68';
const BORDER = '#E8E8E4';

export type Audience = 'all' | 'trial' | 'lifetime' | 'custom';
export interface Recipient {
  email: string;
  name?: string;
}

export interface WrapInput {
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
}

/**
 * Reusable CTA button. The composer can insert this verbatim. Styles are inlined
 * so they survive Gmail/Outlook/Apple Mail stripping <style>. Rendered as a
 * table so Outlook (which ignores padding on <a>) still draws the full button.
 */
export function ctaButton(label: string, url: string): string {
  const safeUrl = String(url || '#');
  const safeLabel = escapeHtml(String(label || 'Deschide'));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" bgcolor="${ORANGE}" style="border-radius:12px;">
      <a href="${escapeHtml(safeUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:'Inter',Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background-color:${ORANGE};">${safeLabel}</a>
    </td>
  </tr>
</table>`;
}

/** Section heading helper the composer can inject. */
export function emailHeading(text: string): string {
  return `<h2 style="margin:28px 0 12px;font-family:'Inter',Arial,sans-serif;font-size:20px;font-weight:700;line-height:1.3;color:${INK};letter-spacing:-0.02em;">${escapeHtml(text)}</h2>`;
}

/** Paragraph helper the composer can inject. */
export function emailParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:'Inter',Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK};">${escapeHtml(text)}</p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap a body fragment in a full, responsive, email-client-safe HTML document.
 * Table-based layout, max-width 600px, cream/ink/orange palette, all styles inline.
 * Convention: the body may use `ctaButton()`, `emailHeading()`, `emailParagraph()`
 * helpers, or raw inline-styled HTML. A `.cta`-classed anchor is also styled via
 * a fallback <style> for clients that do honor it, but the table button above is
 * the safe default.
 */
export function wrapEmailHtml({ subject, preheader, bodyHtml }: WrapInput): string {
  const pre = preheader ? escapeHtml(String(preheader)) : '';
  const safeSubject = escapeHtml(String(subject || 'facturamea'));
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="ro">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${safeSubject}</title>
  <style>
    /* Honored only by clients that keep <style>; the inline table button is the real CTA. */
    a.cta { display:inline-block; padding:14px 28px; background:${ORANGE}; color:#ffffff !important; text-decoration:none; border-radius:12px; font-weight:700; }
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .px { padding-left:24px !important; padding-right:24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${CREAM};">${pre}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td class="px" style="padding:28px 40px;border-bottom:1px solid ${BORDER};">
              <span style="font-family:'Inter',Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:${INK};">factura<span style="color:${ORANGE};">mea</span></span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="px" style="padding:32px 40px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="px" style="padding:24px 40px 32px;border-top:1px solid ${BORDER};">
              <p style="margin:0 0 6px;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
                facturamea · Platformă de facturare pentru transport și logistică
              </p>
              <p style="margin:0;font-family:'Inter',Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
                Ai primit acest email pentru că ai un cont facturamea.
                <a href="{{unsubscribe_url}}" style="color:${MUTED};text-decoration:underline;">Dezabonează-te</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse the custom recipients textarea: split on comma / newline / space, validate, dedupe. */
export function parseCustomRecipients(raw: string | null | undefined): Recipient[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const token of String(raw).split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email });
  }
  return out;
}

/**
 * Resolve the recipient list for an audience. Always wrapped in try/catch so a
 * missing/unavailable DB returns [] instead of throwing (no DB connected in dev).
 */
export async function resolveAudience(
  audience: Audience,
  customRecipients?: string | null,
): Promise<Recipient[]> {
  if (audience === 'custom') {
    return parseCustomRecipients(customRecipients);
  }

  try {
    if (audience === 'all') {
      const rows = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(and(isNull(users.deletedAt), isNotNull(users.email), ne(users.email, '')));
      return dedupe(rows);
    }

    // trial | lifetime: join users -> appLicenses by companyId, active license only.
    const plan = audience === 'trial' ? 'trial' : 'lifetime';
    const rows = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .innerJoin(appLicenses, eq(appLicenses.companyId, users.companyId))
      .where(
        and(
          isNull(users.deletedAt),
          isNotNull(users.email),
          ne(users.email, ''),
          eq(appLicenses.plan, plan),
          eq(appLicenses.status, 'active'),
        ),
      );
    return dedupe(rows);
  } catch (err) {
    console.error('resolveAudience failed', err);
    return [];
  }
}

function dedupe(rows: { email: string | null; name: string | null }[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    if (!r.email) continue;
    const email = r.email.toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ email: r.email, name: r.name ?? undefined });
  }
  return out;
}
