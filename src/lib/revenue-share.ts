// Revenue share către asociat prin Stripe Connect (separate transfers).
// SOLAAS încasează 100% în contul propriu; la fiecare vânzare reușită se
// transferă un procent (default 20%) în contul Connect al asociatului.
// Config stocat în platform_settings (key-value) ca să nu necesite redeploy.
import { db } from '../db';
import { platformSettings, revenueSharePayouts } from '../db/schema';
import { nanoid } from 'nanoid';
import { getStripe } from './stripe';

export const RS_KEYS = {
  accountId: 'revshare_account_id',
  enabled: 'revshare_enabled',
  bps: 'revshare_bps',
  base: 'revshare_base',
} as const;

// Baza pe care se aplică procentul:
//  - 'gross'        : din suma plătită de client
//  - 'net_after_fee': din suma rămasă după comisionul Stripe (default)
//  - 'net_after_vat': din suma fără TVA și fără comision
export type RevShareBase = 'gross' | 'net_after_fee' | 'net_after_vat';

export interface RevShareConfig {
  accountId: string | null;
  enabled: boolean;
  bps: number;           // basis points (2000 = 20%)
  base: RevShareBase;
}

const DEFAULTS: RevShareConfig = { accountId: null, enabled: false, bps: 2000, base: 'net_after_fee' };

export async function getRevShareConfig(): Promise<RevShareConfig> {
  let rows: { key: string; value: string | null }[] = [];
  try {
    rows = await db.select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings);
  } catch {
    return { ...DEFAULTS };
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const baseRaw = map.get(RS_KEYS.base) as RevShareBase | undefined;
  return {
    accountId: map.get(RS_KEYS.accountId) || null,
    enabled: map.get(RS_KEYS.enabled) === 'true',
    bps: clampBps(Number(map.get(RS_KEYS.bps))),
    base: baseRaw === 'gross' || baseRaw === 'net_after_vat' || baseRaw === 'net_after_fee' ? baseRaw : DEFAULTS.base,
  };
}

export async function setRevShareSetting(key: string, value: string): Promise<void> {
  await db.insert(platformSettings).values({ key, value, updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
}

function clampBps(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULTS.bps;
  return Math.min(10000, Math.round(n)); // niciodată peste 100%
}

// Calculează baza și suma de transferat (în cents/bani), pe baza configului.
// vatRate e folosit doar pentru 'net_after_vat' (default 21%).
export function computeShare(opts: {
  grossCents: number;
  feeCents: number;
  bps: number;
  base: RevShareBase;
  vatRate?: number;
}): { baseCents: number; amountCents: number } {
  const gross = Math.max(0, Math.round(opts.grossCents || 0));
  const fee = Math.max(0, Math.round(opts.feeCents || 0));
  const vatRate = opts.vatRate ?? 21;
  let baseCents: number;
  if (opts.base === 'gross') {
    baseCents = gross;
  } else if (opts.base === 'net_after_vat') {
    const exVat = vatRate > 0 ? Math.round(gross / (1 + vatRate / 100)) : gross;
    baseCents = Math.max(0, exVat - fee);
  } else {
    baseCents = Math.max(0, gross - fee); // net_after_fee
  }
  const amountCents = Math.floor((baseCents * clampBps(opts.bps)) / 10000);
  return { baseCents, amountCents };
}

export function basePercentLabel(base: RevShareBase): string {
  return base === 'gross' ? 'din suma brută'
    : base === 'net_after_vat' ? 'din net (fără TVA și comision)'
    : 'din net (după comisionul Stripe)';
}

// Transferă procentul asociatului pentru o plată reușită (Checkout session).
// Idempotent: cheia Stripe `revshare_<sessionId>` împiedică dublarea chiar dacă
// webhookul e livrat de mai multe ori; rândul din revenue_share_payouts e audit.
// Nu aruncă niciodată — eșecul transferului NU trebuie să rateze webhookul.
export async function processLifetimeRevShare(session: any): Promise<void> {
  const sourceId = String(session?.id || '');
  if (!sourceId) return;
  const grossCents = Math.round(Number(session.amount_total) || 0);
  const currency = String(session.currency || 'ron').toUpperCase();
  const companyId = session.metadata?.companyId || session.client_reference_id || null;

  const record = async (patch: Record<string, unknown>) => {
    try {
      await db.insert(revenueSharePayouts).values({
        id: nanoid(), sourceType: 'lifetime', sourceId, companyId,
        destinationAccount: '', grossCents, currency,
        ...patch,
      } as any).onConflictDoUpdate({
        target: [revenueSharePayouts.sourceType, revenueSharePayouts.sourceId],
        set: { ...patch, currency },
      });
    } catch { /* audit best-effort */ }
  };

  const cfg = await getRevShareConfig();
  if (!cfg.enabled || !cfg.accountId) {
    await record({ destinationAccount: cfg.accountId || '', status: 'skipped', error: cfg.enabled ? 'Cont asociat neconfigurat' : 'Revenue share dezactivat', bps: cfg.bps });
    return;
  }

  const stripe = getStripe();
  if (!stripe) { await record({ destinationAccount: cfg.accountId, status: 'error', error: 'Stripe neconfigurat', bps: cfg.bps }); return; }

  // Comisionul Stripe real + charge-ul sursă (ca transferul să tragă din fondurile lui).
  let feeCents = 0;
  let chargeId: string | undefined;
  try {
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (piId) {
      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge.balance_transaction'] });
      const charge: any = (pi as any).latest_charge;
      if (charge && typeof charge === 'object') {
        chargeId = charge.id;
        const bt = charge.balance_transaction;
        if (bt && typeof bt === 'object') feeCents = Math.max(0, Math.round(bt.fee || 0));
      }
    }
  } catch { /* fee rămâne 0 → baza e mai conservatoare doar dacă base=net_after_fee */ }

  const { baseCents, amountCents } = computeShare({ grossCents, feeCents, bps: cfg.bps, base: cfg.base });
  if (amountCents <= 0) {
    await record({ destinationAccount: cfg.accountId, feeCents, baseCents, bps: cfg.bps, amountCents: 0, status: 'skipped', error: 'Sumă de transfer 0' });
    return;
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: currency.toLowerCase(),
      destination: cfg.accountId,
      transfer_group: sourceId,
      ...(chargeId ? { source_transaction: chargeId } : {}),
      description: `Revenue share ${(cfg.bps / 100).toFixed(0)}% — ${sourceId}`,
      metadata: { sourceType: 'lifetime', sourceId, companyId: companyId || '' },
    }, { idempotencyKey: `revshare_${sourceId}` });
    await record({ destinationAccount: cfg.accountId, feeCents, baseCents, bps: cfg.bps, amountCents, stripeTransferId: transfer.id, status: 'paid', error: null });
  } catch (e: any) {
    await record({ destinationAccount: cfg.accountId, feeCents, baseCents, bps: cfg.bps, amountCents, status: 'error', error: String(e?.message || e).slice(0, 500) });
  }
}
