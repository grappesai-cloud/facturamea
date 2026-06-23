// Dunning — automated payment reminders for outstanding invoices.
//
// For each company with dunningEnabled, we look at issued/sent/partial/overdue
// invoices that have a client email (via invoiceClients) and a dueAt, and send
// up to three reminders per invoice:
//   - 'before' : 3 days before the due date
//   - 'due'    : on the due date
//   - 'after'  : 7 days after the due date
// Each (invoiceId, kind) is sent at most once — guarded by the unique index on
// invoiceReminders(invoiceId, kind). Everything is wrapped in try/catch so a
// missing DB or a single bad row never aborts the whole run.

import { db } from '../db';
import { companies, transportInvoices, invoiceClients, invoiceReminders } from '../db/schema';
import { and, eq, isNotNull, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sendEmail } from './notifications';

export type ReminderKind = 'before' | 'due' | 'after';

const DAY_MS = 86_400_000;
// Invoices in these states may still need chasing.
const DUNNABLE_STATUSES = ['issued', 'sent', 'partial', 'overdue'];

const ron = (cents: number, currency = 'RON') => {
  try {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: currency || 'RON' }).format((cents || 0) / 100);
  } catch {
    return `${((cents || 0) / 100).toFixed(2)} ${currency || 'RON'}`;
  }
};

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d: Date) => {
  try {
    return new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Bucharest' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

export interface ReminderEmailInput {
  clientName: string;
  fullNumber: string;
  totalCents: number;
  dueDate: Date;
  kind: ReminderKind;
  currency?: string;
  amountDueCents?: number; // remaining balance; falls back to totalCents
}

/** Branded HTML body for a reminder email. */
export function reminderEmailHtml(input: ReminderEmailInput): string {
  const { clientName, fullNumber, totalCents, dueDate, kind } = input;
  const currency = input.currency || 'RON';
  const amount = input.amountDueCents != null && input.amountDueCents > 0 ? input.amountDueCents : totalCents;
  const dueStr = fmtDate(dueDate);

  let headline: string;
  let intro: string;
  let accent: string;
  switch (kind) {
    case 'before':
      headline = 'Reminder: factură cu scadența în curând';
      intro = `Vă reamintim că factura <strong>${esc(fullNumber)}</strong> are scadența pe <strong>${esc(dueStr)}</strong>.`;
      accent = '#1D4ED8';
      break;
    case 'due':
      headline = 'Factura este scadentă astăzi';
      intro = `Factura <strong>${esc(fullNumber)}</strong> are termenul de plată astăzi, <strong>${esc(dueStr)}</strong>.`;
      accent = '#B45309';
      break;
    case 'after':
    default:
      headline = 'Factură restantă';
      intro = `Factura <strong>${esc(fullNumber)}</strong> a depășit scadența din <strong>${esc(dueStr)}</strong> și figurează ca neachitată.`;
      accent = '#B91C1C';
      break;
  }

  return `<!DOCTYPE html>
<html lang="ro">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F6F6F2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0A0A0A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F6F2;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E8E8E4;border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background:${accent};"></td></tr>
        <tr><td style="padding:28px 28px 8px 28px;">
          <p style="margin:0 0 4px 0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#8A8A85;">facturamea</p>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#0A0A0A;">${esc(headline)}</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 0 28px;font-size:15px;line-height:1.6;color:#3D3D3A;">
          <p style="margin:0 0 12px 0;">Bună ziua${clientName ? ', ' + esc(clientName) : ''},</p>
          <p style="margin:0 0 16px 0;">${intro}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;border:1px solid #F0F0EC;border-radius:12px;margin:8px 0 16px 0;">
            <tr><td style="padding:14px 16px;font-size:14px;color:#6B6B68;">Factură</td><td style="padding:14px 16px;font-size:14px;font-weight:600;text-align:right;color:#0A0A0A;">${esc(fullNumber)}</td></tr>
            <tr><td style="padding:0 16px 14px 16px;font-size:14px;color:#6B6B68;">Scadență</td><td style="padding:0 16px 14px 16px;font-size:14px;font-weight:600;text-align:right;color:#0A0A0A;">${esc(dueStr)}</td></tr>
            <tr><td style="padding:0 16px 16px 16px;font-size:15px;color:#0A0A0A;">Sumă de plată</td><td style="padding:0 16px 16px 16px;font-size:18px;font-weight:700;text-align:right;color:${accent};">${esc(ron(amount, currency))}</td></tr>
          </table>
          <p style="margin:0 0 16px 0;">Dacă plata a fost deja efectuată, vă rugăm să ignorați acest mesaj. Vă mulțumim.</p>
        </td></tr>
        <tr><td style="padding:0 28px 28px 28px;">
          <p style="margin:0;font-size:12px;color:#A8A8A4;line-height:1.5;">Acest mesaj a fost trimis automat de facturamea ca reminder de încasare.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const subjectFor = (kind: ReminderKind, fullNumber: string): string => {
  switch (kind) {
    case 'before': return `Reminder: factura ${fullNumber} are scadența în curând`;
    case 'due': return `Factura ${fullNumber} este scadentă astăzi`;
    case 'after':
    default: return `Factura ${fullNumber} este restantă`;
  }
};

const plainFor = (input: ReminderEmailInput): string => {
  const currency = input.currency || 'RON';
  const amount = input.amountDueCents != null && input.amountDueCents > 0 ? input.amountDueCents : input.totalCents;
  return [
    `Bună ziua${input.clientName ? ', ' + input.clientName : ''},`,
    '',
    `Factura ${input.fullNumber}, scadentă pe ${fmtDate(input.dueDate)}, are de plată ${ron(amount, currency)}.`,
    'Dacă plata a fost deja efectuată, vă rugăm să ignorați acest mesaj. Vă mulțumim.',
    '',
    'facturamea',
  ].join('\n');
};

/** Which reminder kind (if any) applies to an invoice given its dueAt vs now. */
function dueKind(dueAt: Date, now: Date): ReminderKind | null {
  const dueDay = Math.floor(dueAt.getTime() / DAY_MS);
  const nowDay = Math.floor(now.getTime() / DAY_MS);
  const diff = nowDay - dueDay; // 0 = due today, >0 = past due, <0 = upcoming
  if (diff === -3) return 'before';
  if (diff === 0) return 'due';
  if (diff === 7) return 'after';
  return null;
}

export interface RunRemindersResult {
  ok: boolean;
  companiesProcessed: number;
  candidates: number;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Send due reminders. If companyId is passed, only that company is processed
 * (used by the manual "trimite acum" trigger); otherwise every company with
 * dunningEnabled is scanned (the daily cron path). Fully guarded.
 */
export async function runReminders(companyId?: string): Promise<RunRemindersResult> {
  const result: RunRemindersResult = { ok: true, companiesProcessed: 0, candidates: 0, sent: 0, skipped: 0, errors: 0 };
  const now = new Date();

  let targetCompanyIds: string[] = [];
  try {
    const conds: any[] = [eq(companies.dunningEnabled, true)];
    if (companyId) conds.push(eq(companies.id, companyId));
    const rows = await db.select({ id: companies.id }).from(companies).where(and(...conds));
    targetCompanyIds = rows.map((r) => r.id);
  } catch {
    return { ...result, ok: false };
  }

  if (targetCompanyIds.length === 0) return result;

  for (const cid of targetCompanyIds) {
    result.companiesProcessed += 1;
    let candidates: Array<{
      id: string;
      fullNumber: string;
      clientNameSnap: string;
      totalCents: number;
      paidCents: number;
      currency: string | null;
      dueAt: Date | null;
      email: string | null;
    }> = [];

    try {
      candidates = await db
        .select({
          id: transportInvoices.id,
          fullNumber: transportInvoices.fullNumber,
          clientNameSnap: transportInvoices.clientNameSnap,
          totalCents: transportInvoices.totalCents,
          paidCents: transportInvoices.paidCents,
          currency: transportInvoices.currency,
          dueAt: transportInvoices.dueAt,
          email: invoiceClients.email,
        })
        .from(transportInvoices)
        .leftJoin(invoiceClients, eq(transportInvoices.clientExternalId, invoiceClients.id))
        .where(
          and(
            eq(transportInvoices.companyId, cid),
            isNotNull(transportInvoices.dueAt),
            isNotNull(transportInvoices.clientExternalId),
            inArray(transportInvoices.status, DUNNABLE_STATUSES),
          ),
        )
        .limit(2000);
    } catch {
      result.errors += 1;
      continue;
    }

    for (const inv of candidates) {
      if (!inv.dueAt) continue;
      const dueAt = inv.dueAt instanceof Date ? inv.dueAt : new Date(inv.dueAt as any);
      if (isNaN(dueAt.getTime())) continue;
      const email = (inv.email || '').trim();
      if (!email) continue;
      const balance = (inv.totalCents || 0) - (inv.paidCents || 0);
      if (balance <= 0) continue; // already settled

      const kind = dueKind(dueAt, now);
      if (!kind) continue;
      result.candidates += 1;

      // Skip if we've already sent this kind for this invoice.
      try {
        const [existing] = await db
          .select({ id: invoiceReminders.id })
          .from(invoiceReminders)
          .where(and(eq(invoiceReminders.invoiceId, inv.id), eq(invoiceReminders.kind, kind)))
          .limit(1);
        if (existing) { result.skipped += 1; continue; }
      } catch {
        result.errors += 1;
        continue;
      }

      const html = reminderEmailHtml({
        clientName: inv.clientNameSnap || '',
        fullNumber: inv.fullNumber,
        totalCents: inv.totalCents || 0,
        dueDate: dueAt,
        kind,
        currency: inv.currency || 'RON',
        amountDueCents: balance,
      });
      const subject = subjectFor(kind, inv.fullNumber);
      const text = plainFor({
        clientName: inv.clientNameSnap || '',
        fullNumber: inv.fullNumber,
        totalCents: inv.totalCents || 0,
        dueDate: dueAt,
        kind,
        currency: inv.currency || 'RON',
        amountDueCents: balance,
      });

      try {
        await sendEmail(email, subject, text, html);
      } catch {
        // Resend unconfigured or send failed — don't record a reminder, so it
        // can be retried on a later run.
        result.errors += 1;
        continue;
      }

      // Record the send. The unique index guards against a double-insert if two
      // runs race; treat an insert conflict as a no-op.
      try {
        await db.insert(invoiceReminders).values({
          id: nanoid(),
          companyId: cid,
          invoiceId: inv.id,
          kind,
          sentTo: email.slice(0, 200),
        } as any);
        result.sent += 1;
      } catch {
        // Likely the unique constraint (already recorded by a concurrent run).
        result.skipped += 1;
      }
    }
  }

  return result;
}
