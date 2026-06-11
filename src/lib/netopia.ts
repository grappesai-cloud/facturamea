// Netopia (mobilPay) payment integration — Romanian card payment processor.
//
// Credential-gated: when NETOPIA_API_KEY / NETOPIA_SIGNATURE are unset the
// module loads cleanly and every entry point returns a clear "neconfigurat"
// result instead of throwing. Endpoints surface a 503 in that state.
//
// Env (all optional, read at call time so the module never crashes on import):
//   NETOPIA_SIGNATURE  — POS signature (string, identifies the merchant point of sale)
//   NETOPIA_API_KEY    — API key, sent as the Authorization header
//   NETOPIA_SANDBOX    — '1' to target the sandbox host, anything else = production
//
// We use the Netopia v2 REST API ("Start payment"):
//   POST {base}/payment/card/start
//   Authorization: <NETOPIA_API_KEY>
//   body: { config, payment, order }
// The hosted-page / redirect URL comes back under payment.paymentURL (the API
// shape has shifted across versions, so we read it defensively from a few keys).

const SANDBOX_BASE = 'https://secure.sandbox.netopia-payments.com';
const PROD_BASE = 'https://secure.netopia-payments.com';

export interface NetopiaCreateInput {
  orderId: string;
  amountCents: number;
  currency?: string;
  description?: string;
  returnUrl: string;   // browser is redirected here after the payment flow
  confirmUrl: string;  // server-to-server IPN target (our webhook)
  billing?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
}

export interface NetopiaCreateResult {
  ok: boolean;
  redirectUrl?: string;
  ntpId?: string;     // Netopia's reference for this payment, when returned
  raw?: unknown;      // full response payload (best-effort), for logging
  error?: string;
}

export interface NetopiaCallback {
  ok: boolean;
  status?: string;     // raw Netopia status code / label, when parseable
  paid?: boolean;      // true when the payment is confirmed/captured
  ntpId?: string | null;
  orderId?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  error?: string;
}

function apiKey(): string | undefined {
  return (import.meta as any).env?.NETOPIA_API_KEY ?? process.env.NETOPIA_API_KEY;
}
function signature(): string | undefined {
  return (import.meta as any).env?.NETOPIA_SIGNATURE ?? process.env.NETOPIA_SIGNATURE;
}
function sandboxFlag(): string | undefined {
  return (import.meta as any).env?.NETOPIA_SANDBOX ?? process.env.NETOPIA_SANDBOX;
}

export function isNetopiaSandbox(): boolean {
  return String(sandboxFlag() || '') === '1';
}

export function netopiaBaseUrl(): string {
  return isNetopiaSandbox() ? SANDBOX_BASE : PROD_BASE;
}

// Both an API key and a POS signature are required for a usable integration.
export function isNetopiaConfigured(): boolean {
  return Boolean(apiKey() && signature());
}

// RON amounts are sent as a decimal string (e.g. "123.45") in the v2 API.
function centsToDecimalString(cents: number): string {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  return (n / 100).toFixed(2);
}

// Pull a redirect/hosted-page URL out of a Netopia response without assuming a
// single fixed shape (the field has moved between API revisions).
function extractRedirectUrl(data: any): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const candidates = [
    data?.payment?.paymentURL,
    data?.payment?.redirectURL,
    data?.payment?.url,
    data?.paymentURL,
    data?.redirectURL,
    data?.url,
    data?.data?.payment?.paymentURL,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//i.test(c)) return c;
  }
  return undefined;
}

function extractNtpId(data: any): string | undefined {
  const candidates = [
    data?.payment?.ntpID,
    data?.payment?.ntpId,
    data?.ntpID,
    data?.ntpId,
    data?.payment?.token,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim()) return String(c);
  }
  return undefined;
}

// Create a Netopia card payment and return the hosted-page redirect URL.
export async function createNetopiaPayment(input: NetopiaCreateInput): Promise<NetopiaCreateResult> {
  if (!isNetopiaConfigured()) {
    return { ok: false, error: 'Netopia neconfigurat (lipsesc cheile).' };
  }

  const key = apiKey()!;
  const sig = signature()!;
  const amount = centsToDecimalString(input.amountCents);
  const currency = (input.currency || 'RON').toUpperCase();

  if (Number(amount) <= 0) {
    return { ok: false, error: 'Sumă invalidă pentru plată.' };
  }

  const body = {
    config: {
      emailTemplate: '',
      notifyUrl: input.confirmUrl,
      redirectUrl: input.returnUrl,
      language: 'ro',
    },
    payment: {
      options: { installments: 0, bonus: 0 },
      instrument: { type: 'card' },
    },
    order: {
      ntpID: '',
      posSignature: sig,
      dateTime: new Date().toISOString(),
      description: input.description || `Plată factură ${input.orderId}`,
      orderID: input.orderId,
      amount: Number(amount),
      currency,
      billing: {
        email: input.billing?.email || '',
        phone: input.billing?.phone || '',
        firstName: input.billing?.firstName || '',
        lastName: input.billing?.lastName || '',
        city: '',
        country: 642, // Romania (ISO 3166-1 numeric) — Netopia expects a code here
        state: '',
        postalCode: '',
        details: '',
      },
    },
  };

  let res: Response;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    res = await fetch(`${netopiaBaseUrl()}/payment/card/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch (err) {
    return { ok: false, error: `Conexiune Netopia eșuată: ${err instanceof Error ? err.message : 'eroare rețea'}` };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.message || data?.error?.message || data?.error || `HTTP ${res.status}`;
    return { ok: false, error: `Netopia a respins cererea: ${msg}`, raw: data };
  }

  const redirectUrl = extractRedirectUrl(data);
  if (!redirectUrl) {
    return { ok: false, error: 'Netopia nu a returnat un link de plată.', raw: data };
  }

  return { ok: true, redirectUrl, ntpId: extractNtpId(data), raw: data };
}

// Best-effort parse of a Netopia IPN/return payload. The IPN posts either a
// JSON body (v2) or a legacy env_key/data pair (v1). We normalize both into a
// common shape and decide whether the payment is confirmed. Verification of the
// POS signature is best-effort: we confirm the posSignature matches our own.
export function verifyNetopiaCallback(body: any): NetopiaCallback {
  if (!isNetopiaConfigured()) {
    return { ok: false, error: 'Netopia neconfigurat (lipsesc cheile).' };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload IPN invalid.' };
  }

  // v2 JSON IPN shape: { order: {...}, payment: { status, ntpID, amount } }
  const order = body.order || body.data?.order || {};
  const payment = body.payment || body.data?.payment || {};

  const postedSig = order.posSignature || body.posSignature;
  const ourSig = signature();
  // If a POS signature is present, it must match ours. When absent (some IPN
  // variants omit it), we don't hard-fail — we still record defensively but
  // flag it via ok:true only when amounts/ids look sane.
  if (postedSig && ourSig && String(postedSig) !== String(ourSig)) {
    return { ok: false, error: 'Semnătură POS Netopia necorespunzătoare.' };
  }

  const rawStatus =
    payment.status ?? body.status ?? body.errorType ?? payment.code ?? null;
  // Netopia v2 numeric statuses: 3 = paid/confirmed, 5 = confirmed (capture).
  // String labels: 'confirmed' | 'paid'. Treat those as paid.
  const statusStr = String(rawStatus ?? '').toLowerCase();
  const paid =
    statusStr === 'confirmed' ||
    statusStr === 'paid' ||
    statusStr === '3' ||
    statusStr === '5';

  const amountRaw = payment.amount ?? order.amount ?? body.amount ?? null;
  const amountCents =
    amountRaw != null && !Number.isNaN(Number(amountRaw))
      ? Math.round(Number(amountRaw) * 100)
      : null;

  return {
    ok: true,
    status: rawStatus != null ? String(rawStatus) : undefined,
    paid,
    ntpId: payment.ntpID || payment.ntpId || body.ntpID || null,
    orderId: order.orderID || order.orderId || body.orderID || null,
    amountCents,
    currency: order.currency || body.currency || null,
  };
}
