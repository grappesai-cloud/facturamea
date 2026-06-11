// Open banking via GoCardless Bank Account Data (formerly Nordigen).
//
// Credential-gated: when GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY are unset
// the module loads cleanly and every entry point returns a structured error
// instead of throwing. Endpoints surface a 503 in that state.
//
// Env (optional, read at call time):
//   GOCARDLESS_SECRET_ID   — Bank Account Data secret id
//   GOCARDLESS_SECRET_KEY  — Bank Account Data secret key
//
// Flow:
//   1. getAccessToken()                  -> short-lived bearer token
//   2. listInstitutions('RO')            -> pick a bank
//   3. createRequisition(inst, redirect) -> get a `link` the user visits to authorize
//   4. getRequisition(id)                -> after auth, read the granted account ids
//   5. getAccountTransactions(accId)     -> normalized transactions to import

const BASE = 'https://bankaccountdata.gocardless.com';

export interface OBResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface OBInstitution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  countries?: string[];
}

export interface OBRequisition {
  id: string;
  status?: string;
  link?: string;        // URL the user opens to authorize at their bank
  institutionId?: string;
  reference?: string;
  accounts?: string[];  // account ids, populated once authorized
}

export interface OBTransaction {
  bookingDate: string | null;     // 'YYYY-MM-DD'
  amountCents: number;            // + incoming, - outgoing
  currency: string;
  description: string | null;
  counterparty: string | null;
  counterpartyIban?: string | null;
  reference: string | null;
  externalId: string;             // dedupe key (transactionId / internalTransactionId)
}

function secretId(): string | undefined {
  return (import.meta as any).env?.GOCARDLESS_SECRET_ID ?? process.env.GOCARDLESS_SECRET_ID;
}
function secretKey(): string | undefined {
  return (import.meta as any).env?.GOCARDLESS_SECRET_KEY ?? process.env.GOCARDLESS_SECRET_KEY;
}

export function isOpenBankingConfigured(): boolean {
  return Boolean(secretId() && secretKey());
}

function unconfigured<T>(): OBResult<T> {
  return { ok: false, error: 'Open banking neconfigurat (lipsesc GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY).' };
}

async function obFetch(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const { token, headers, ...rest } = init;
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(headers as Record<string, string> | undefined),
  };
  if (token) h.Authorization = `Bearer ${token}`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${BASE}${path}`, { ...rest, headers: h, signal: controller.signal });
    clearTimeout(t);
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
      const msg =
        data?.summary || data?.detail || data?.message ||
        (typeof data === 'object' ? JSON.stringify(data) : `HTTP ${res.status}`);
      return { ok: false, status: res.status, data, error: `GoCardless: ${msg}` };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: `Conexiune GoCardless eșuată: ${err instanceof Error ? err.message : 'eroare rețea'}` };
  }
}

// Exchange the secret id/key for a short-lived access token.
export async function getAccessToken(): Promise<OBResult<string>> {
  if (!isOpenBankingConfigured()) return unconfigured<string>();
  const r = await obFetch('/api/v2/token/new/', {
    method: 'POST',
    body: JSON.stringify({ secret_id: secretId(), secret_key: secretKey() }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  const access = r.data?.access;
  if (!access) return { ok: false, error: 'GoCardless nu a returnat un token de acces.' };
  return { ok: true, data: String(access) };
}

// List the banks available in a country (default Romania).
export async function listInstitutions(country = 'RO'): Promise<OBResult<OBInstitution[]>> {
  if (!isOpenBankingConfigured()) return unconfigured<OBInstitution[]>();
  const tok = await getAccessToken();
  if (!tok.ok || !tok.data) return { ok: false, error: tok.error };

  const r = await obFetch(`/api/v2/institutions/?country=${encodeURIComponent(country)}`, {
    method: 'GET',
    token: tok.data,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const list = Array.isArray(r.data) ? r.data : [];
  const institutions: OBInstitution[] = list.map((i: any) => ({
    id: String(i.id),
    name: String(i.name || i.id),
    bic: i.bic || undefined,
    logo: i.logo || undefined,
    countries: Array.isArray(i.countries) ? i.countries : undefined,
  }));
  return { ok: true, data: institutions };
}

// Create a requisition (consent flow). Returns the link the user must visit.
export async function createRequisition(
  institutionId: string,
  redirect: string,
  reference?: string,
): Promise<OBResult<OBRequisition>> {
  if (!isOpenBankingConfigured()) return unconfigured<OBRequisition>();
  if (!institutionId) return { ok: false, error: 'Lipsește banca selectată.' };
  const tok = await getAccessToken();
  if (!tok.ok || !tok.data) return { ok: false, error: tok.error };

  const r = await obFetch('/api/v2/requisitions/', {
    method: 'POST',
    token: tok.data,
    body: JSON.stringify({
      redirect,
      institution_id: institutionId,
      reference: reference || `fm-${Date.now()}`,
      user_language: 'RO',
    }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: mapRequisition(r.data) };
}

// Read a requisition by id — after the user authorizes, `accounts` is populated.
export async function getRequisition(id: string): Promise<OBResult<OBRequisition>> {
  if (!isOpenBankingConfigured()) return unconfigured<OBRequisition>();
  if (!id) return { ok: false, error: 'Lipsește id-ul requisition.' };
  const tok = await getAccessToken();
  if (!tok.ok || !tok.data) return { ok: false, error: tok.error };

  const r = await obFetch(`/api/v2/requisitions/${encodeURIComponent(id)}/`, {
    method: 'GET',
    token: tok.data,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: mapRequisition(r.data) };
}

function mapRequisition(d: any): OBRequisition {
  return {
    id: String(d?.id || ''),
    status: d?.status || undefined,
    link: d?.link || undefined,
    institutionId: d?.institution_id || undefined,
    reference: d?.reference || undefined,
    accounts: Array.isArray(d?.accounts) ? d.accounts.map((a: any) => String(a)) : [],
  };
}

// Fetch and normalize transactions for one account id.
export async function getAccountTransactions(accountId: string): Promise<OBResult<OBTransaction[]>> {
  if (!isOpenBankingConfigured()) return unconfigured<OBTransaction[]>();
  if (!accountId) return { ok: false, error: 'Lipsește id-ul contului.' };
  const tok = await getAccessToken();
  if (!tok.ok || !tok.data) return { ok: false, error: tok.error };

  const r = await obFetch(`/api/v2/accounts/${encodeURIComponent(accountId)}/transactions/`, {
    method: 'GET',
    token: tok.data,
  });
  if (!r.ok) return { ok: false, error: r.error };

  const booked: any[] = r.data?.transactions?.booked || [];
  const pending: any[] = r.data?.transactions?.pending || [];
  const all = [...booked, ...pending];
  const out: OBTransaction[] = [];
  for (const t of all) {
    out.push(normalizeTransaction(t));
  }
  return { ok: true, data: out };
}

// Optional convenience: account IBAN/metadata, used when creating a bankAccounts row.
export async function getAccountDetails(accountId: string): Promise<OBResult<{ iban?: string; currency?: string; ownerName?: string; name?: string }>> {
  if (!isOpenBankingConfigured()) return unconfigured();
  if (!accountId) return { ok: false, error: 'Lipsește id-ul contului.' };
  const tok = await getAccessToken();
  if (!tok.ok || !tok.data) return { ok: false, error: tok.error };

  const r = await obFetch(`/api/v2/accounts/${encodeURIComponent(accountId)}/details/`, {
    method: 'GET',
    token: tok.data,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const acc = r.data?.account || {};
  return {
    ok: true,
    data: {
      iban: acc.iban || undefined,
      currency: acc.currency || undefined,
      ownerName: acc.ownerName || undefined,
      name: acc.name || acc.product || undefined,
    },
  };
}

function normalizeTransaction(t: any): OBTransaction {
  const amountRaw = t?.transactionAmount?.amount ?? t?.amount ?? '0';
  const amountNum = Number(amountRaw);
  const amountCents = Number.isNaN(amountNum) ? 0 : Math.round(amountNum * 100);
  const currency = String(t?.transactionAmount?.currency || t?.currency || 'RON').toUpperCase();

  const bookingDate: string | null =
    t?.bookingDate || t?.valueDate || (t?.bookingDateTime ? String(t.bookingDateTime).slice(0, 10) : null) || null;

  const descParts = [
    Array.isArray(t?.remittanceInformationUnstructuredArray)
      ? t.remittanceInformationUnstructuredArray.join(' ')
      : t?.remittanceInformationUnstructured,
    t?.additionalInformation,
  ].filter(Boolean);
  const description = descParts.length ? String(descParts.join(' · ')).slice(0, 1000) : null;

  // Counterparty: for incoming use debtor, for outgoing use creditor.
  const creditorName = t?.creditorName;
  const debtorName = t?.debtorName;
  const counterparty =
    (amountCents >= 0 ? debtorName : creditorName) || creditorName || debtorName || null;
  const counterpartyIban =
    (amountCents >= 0 ? t?.debtorAccount?.iban : t?.creditorAccount?.iban) ||
    t?.creditorAccount?.iban || t?.debtorAccount?.iban || null;

  const reference =
    t?.endToEndId || t?.checkId || t?.entryReference || t?.mandateId || null;

  const externalId = String(
    t?.transactionId || t?.internalTransactionId || t?.entryReference ||
    // last-resort synthetic key so dedupe still works if no id is provided
    `${bookingDate || 'na'}|${amountCents}|${(description || '').slice(0, 40)}`,
  );

  return {
    bookingDate,
    amountCents,
    currency,
    description,
    counterparty: counterparty ? String(counterparty).slice(0, 200) : null,
    counterpartyIban: counterpartyIban ? String(counterpartyIban).slice(0, 40) : null,
    reference: reference ? String(reference).slice(0, 120) : null,
    externalId: externalId.slice(0, 120),
  };
}
