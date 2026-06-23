// Contextual nudges for an invoice. Pulls structured signals from the DB
// (overdue days, client payment history, etc.) and asks Claude Haiku 4.5 to
// turn them into human, actionable hints in Romanian. Falls back to a
// deterministic rule-based generator when no API key is configured.
//
// Design notes:
//   - We keep the *facts* deterministic (computed via SQL) and only let the
//     LLM phrase the message. This keeps nudges grounded and avoids
//     hallucination of numbers.
//   - The system prompt is heavy and reused across calls — marked as
//     cache_control so Anthropic prompt caching kicks in (5-minute TTL).
//   - Claude is asked for tightly-scoped JSON output we can render.
import { db } from '../db';
import { transportInvoices } from '../db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { daysUntilDue } from './dates';

export type NudgeTone = 'info' | 'warn' | 'good';
export interface Nudge { tone: NudgeTone; message: string }

interface InvoiceSignals {
  invoiceFullNumber: string;
  status: string;
  total: number;       // RON (major units), not bani
  paid: number;        // RON
  remaining: number;   // RON
  currency: string;
  dueDaysFromNow: number | null;       // negative = overdue
  daysOverdue: number | null;
  clientHistoryCount: number | null;
  clientOnTimeRatio: number | null;     // 0..1
  clientAvgDaysLate: number | null;
}

async function gatherSignals(invoiceId: string): Promise<{ inv: typeof transportInvoices.$inferSelect; signals: InvoiceSignals } | null> {
  const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, invoiceId)).limit(1);
  if (!inv) return null;
  const now = new Date();

  // Calendar-day based (RO tz): a due date of TODAY is not overdue.
  const dueDaysFromNow = daysUntilDue(inv.dueAt);
  const daysOverdue = (dueDaysFromNow != null && dueDaysFromNow < 0 && inv.status !== 'paid' && inv.status !== 'voided' && inv.status !== 'reversed')
    ? -dueDaysFromNow : null;

  let historyCount: number | null = null;
  let onTimeRatio: number | null = null;
  let avgDaysLate: number | null = null;

  if (inv.clientCompanyId || inv.clientExternalId) {
    const conds: any[] = [
      eq(transportInvoices.companyId, inv.companyId),
      eq(transportInvoices.kind, 'factura'),
    ];
    if (inv.clientCompanyId) conds.push(eq(transportInvoices.clientCompanyId, inv.clientCompanyId));
    else if (inv.clientExternalId) conds.push(eq(transportInvoices.clientExternalId, inv.clientExternalId));

    const [agg] = await db.select({
      total: sql<number>`COUNT(*)`,
      onTime: sql<number>`SUM(CASE WHEN ${transportInvoices.status} = 'paid' AND (${transportInvoices.paidAt} IS NULL OR ${transportInvoices.dueAt} IS NULL OR ${transportInvoices.paidAt} <= ${transportInvoices.dueAt}) THEN 1 ELSE 0 END)`,
      paidCount: sql<number>`SUM(CASE WHEN ${transportInvoices.status} = 'paid' THEN 1 ELSE 0 END)`,
      avgLate: sql<number>`COALESCE(AVG(CASE WHEN ${transportInvoices.status} = 'paid' AND ${transportInvoices.paidAt} IS NOT NULL AND ${transportInvoices.dueAt} IS NOT NULL AND ${transportInvoices.paidAt} > ${transportInvoices.dueAt} THEN EXTRACT(EPOCH FROM (${transportInvoices.paidAt} - ${transportInvoices.dueAt})) / 86400 END), 0)`,
    }).from(transportInvoices).where(and(...conds));
    historyCount = Number(agg?.total ?? 0);
    const paid = Number(agg?.paidCount ?? 0);
    if (paid > 0) onTimeRatio = Number(agg?.onTime ?? 0) / paid;
    avgDaysLate = Number(agg?.avgLate ?? 0);
  }

  return {
    inv,
    signals: {
      invoiceFullNumber: inv.fullNumber,
      status: inv.status,
      total: Math.round(inv.totalCents) / 100,
      paid: Math.round(inv.paidCents) / 100,
      remaining: Math.round(inv.totalCents - inv.paidCents) / 100,
      currency: inv.currency,
      dueDaysFromNow,
      daysOverdue,
      clientHistoryCount: historyCount,
      clientOnTimeRatio: onTimeRatio,
      clientAvgDaysLate: avgDaysLate,
    },
  };
}

function ruleBasedFallback(signals: InvoiceSignals): Nudge[] {
  const out: Nudge[] = [];
  if (signals.daysOverdue != null) {
    if (signals.clientAvgDaysLate != null && signals.clientAvgDaysLate > 0) {
      const delta = signals.daysOverdue - signals.clientAvgDaysLate;
      if (delta > 5) out.push({ tone: 'warn', message: `Întârziată cu ${signals.daysOverdue} zile — peste media clientului (~${Math.round(signals.clientAvgDaysLate)} zile).` });
      else if (delta < -3) out.push({ tone: 'info', message: `Întârziere de ${signals.daysOverdue} zile — sub media clientului. Probabil va plăti curând.` });
      else out.push({ tone: 'warn', message: `Factură întârziată ${signals.daysOverdue} zile.` });
    } else {
      out.push({ tone: 'warn', message: `Factură întârziată cu ${signals.daysOverdue} zile.` });
    }
  } else if (signals.dueDaysFromNow != null && signals.dueDaysFromNow >= 0 && signals.dueDaysFromNow <= 3) {
    out.push({ tone: 'info', message: `Scadența e în ${signals.dueDaysFromNow} ${signals.dueDaysFromNow === 1 ? 'zi' : 'zile'}.` });
  }

  if (signals.clientHistoryCount != null && signals.clientHistoryCount >= 3 && signals.clientOnTimeRatio != null) {
    const pct = Math.round(signals.clientOnTimeRatio * 100);
    if (pct >= 85) out.push({ tone: 'good', message: `Client cu istoric bun — ${pct}% facturi plătite la timp.` });
    else if (pct < 50) out.push({ tone: 'warn', message: `Atenție — doar ${pct}% din facturile către acest client au fost plătite la timp.` });
  }

  return out;
}

export async function nudgesForInvoice(invoiceId: string): Promise<Nudge[]> {
  const data = await gatherSignals(invoiceId);
  if (!data) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return ruleBasedFallback(data.signals);

  // Use Anthropic SDK with prompt caching on the system message.
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const systemPrompt = [
      'Ești un asistent care generează scurte sugestii (nudges) pentru o factură de transport.',
      'Răspunzi DOAR cu JSON valid: { "nudges": [{ "tone": "info" | "warn" | "good", "message": "..." }] }',
      'Reguli stricte:',
      '- Maximum 3 nudges. Maximum 1 propoziție per nudge, sub 140 caractere.',
      '- Nu inventa cifre. Folosește DOAR numerele din input. Dacă un câmp e null, ignoră-l.',
      '- Sumele (total, paid, remaining) sunt în RON, NU în bani. Adaugă moneda din câmpul currency, ex: "restant 150 RON din 200 RON".',
      '- Nu folosi liniuța lungă (—); folosește virgulă, punct sau două puncte.',
      '- Limbă: română, ton scurt și direct, fără emoji-uri.',
      '- "warn" pentru risc/probleme, "good" pentru semnale pozitive, "info" pentru context neutru.',
      '- Dacă nu ai nimic util de spus, returnează lista goală.',
      'Exemple bune:',
      '  { "tone": "warn", "message": "Întârziată 14 zile, cu 7 peste media clientului (~7 zile)." }',
      '  { "tone": "good", "message": "Client cu istoric bun: 9 din 10 plătite la timp." }',
      '  { "tone": "info", "message": "Scadența e peste 2 zile." }',
    ].join('\n');

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Semnale factură:\n${JSON.stringify(data.signals, null, 2)}\n\nReturnează JSON cu nudges relevante.` },
          ],
        },
      ],
    });

    const textBlock = resp.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const text = textBlock?.text || '';
    // Defensive parse — strip markdown fences if any
    const stripped = text.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed: { nudges?: Nudge[] };
    try { parsed = JSON.parse(stripped); } catch { return ruleBasedFallback(data.signals); }
    const list = Array.isArray(parsed.nudges) ? parsed.nudges : [];
    return list
      .filter((n) => n && typeof n.message === 'string' && ['info', 'warn', 'good'].includes(n.tone))
      .slice(0, 3);
  } catch (err) {
    // Network/quota/anything — graceful fallback so the UI never breaks
    return ruleBasedFallback(data.signals);
  }
}
