// Netopia (mobilPay) payment integration — Romanian card payment processor.
//
// Credential-gated: when NETOPIA_API_KEY / NETOPIA_SIGNATURE are unset the
// module loads cleanly and every entry point returns a clear "neconfigurat"
// result instead of throwing. Endpoints surface a 503 in that state.
//
// Env (all optional, read at call time so the module never crashes on import):
//   NETOPIA_SIGNATURE   — POS signature (string, identifies the merchant point of sale)
//   NETOPIA_API_KEY     — API key, sent as the Authorization header
//   NETOPIA_SANDBOX     — '1' to target the sandbox host, anything else = production
//   NETOPIA_PUBLIC_KEY  — Netopia's RSA PUBLIC key (PEM) used to verify the IPN
//                         signature. REQUIRED to accept real money in production:
//                         Netopia signs each IPN with a JWT in the
//                         `Verification-token` header (alg RS512/RS256), signed
//                         with Netopia's private key. We verify it against this
//                         public key. Without it, IPNs are rejected in prod.
//
// We use the Netopia v2 REST API ("Start payment"):
//   POST {base}/payment/card/start
//   Authorization: <NETOPIA_API_KEY>
//   body: { config, payment, order }
// The hosted-page / redirect URL comes back under payment.paymentURL (the API
// shape has shifted across versions, so we read it defensively from a few keys).

import crypto from 'node:crypto';

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
function publicKey(): string | undefined {
  const raw = (import.meta as any).env?.NETOPIA_PUBLIC_KEY ?? process.env.NETOPIA_PUBLIC_KEY;
  if (!raw) return undefined;
  // Allow the PEM to be supplied with literal "\n" escapes (common in env vars).
  return String(raw).includes('\\n') ? String(raw).replace(/\\n/g, '\n') : String(raw);
}
function isProd(): boolean {
  return Boolean((import.meta as any).env?.PROD || process.env.NODE_ENV === 'production');
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

// ── IPN signature verification (RS512/RS256 JWT in the Verification-token header) ──
// Netopia v2 signs every IPN with a JWT placed in the `Verification-token`
// header. The JWT is signed with Netopia's PRIVATE key; we verify it with the
// merchant's configured PUBLIC key (NETOPIA_PUBLIC_KEY). The JWT body embeds a
// hash/digest binding to the notification payload (Netopia uses the `sub`/
// `aud`-style claims plus the order id). We require a valid RSA signature; on
// any failure we FAIL CLOSED. THIS GATES REAL MONEY — do not loosen.
function b64urlToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

// Verify the JWT signature against the public key. Returns the decoded payload
// object on success, or null on any verification failure.
function verifyIpnToken(token: string, pubKeyPem: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(b64urlToBuffer(headerB64).toString('utf8'));
    const alg = String(header?.alg || '').toUpperCase();
    // Only accept asymmetric RSA algorithms; reject 'none' and HMAC algs which
    // an attacker could forge with public material.
    const hash =
      alg === 'RS512' ? 'RSA-SHA512' :
      alg === 'RS256' ? 'RSA-SHA256' :
      alg === 'RS384' ? 'RSA-SHA384' :
      null;
    if (!hash) return null;

    const verifier = crypto.createVerify(hash);
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const ok = verifier.verify(pubKeyPem, b64urlToBuffer(sigB64));
    if (!ok) return null;

    return JSON.parse(b64urlToBuffer(payloadB64).toString('utf8'));
  } catch {
    return null;
  }
}

// Verify and parse a Netopia IPN. `body` is the parsed JSON/form payload;
// `verificationToken` is the raw value of the `Verification-token` header (the
// signed JWT). Signature verification is MANDATORY and FAILS CLOSED:
//   - missing/invalid token  -> { ok:false }  (never proceed)
//   - public key not configured: in production -> { ok:false }; in dev we allow
//     with a logged warning (mirrors cron-auth.ts), so local testing works.
export function verifyNetopiaCallback(body: any, verificationToken?: string | null): NetopiaCallback {
  if (!isNetopiaConfigured()) {
    return { ok: false, error: 'Netopia neconfigurat (lipsesc cheile).' };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload IPN invalid.' };
  }

  // v2 JSON IPN shape: { order: {...}, payment: { status, ntpID, amount } }
  const order = body.order || body.data?.order || {};
  const payment = body.payment || body.data?.payment || {};

  // --- MANDATORY signature verification (gates real money) ---
  const pub = publicKey();
  if (!pub) {
    if (isProd()) {
      return { ok: false, error: 'Netopia public key neconfigurat (NETOPIA_PUBLIC_KEY) — IPN respins.' };
    }
    // Dev only: allow without a key but log loudly so it is never silently relied on.
    console.warn('[netopia] NETOPIA_PUBLIC_KEY not set — accepting UNVERIFIED IPN (dev only). This is INSECURE in production.');
  } else {
    const token = (verificationToken || '').trim();
    if (!token) {
      return { ok: false, error: 'Lipsește Verification-token Netopia — IPN respins.' };
    }
    const decoded = verifyIpnToken(token, pub);
    if (!decoded) {
      return { ok: false, error: 'Semnătură IPN Netopia invalidă — respins.' };
    }
    // Bind the signed token to this notification's order id when the token
    // carries it (Netopia includes the order/ntp reference in the JWT claims).
    const claimOrder =
      decoded.orderID || decoded.orderId || decoded.order?.orderID || decoded.sub || null;
    const bodyOrder = order.orderID || order.orderId || body.orderID || null;
    if (claimOrder && bodyOrder && String(claimOrder) !== String(bodyOrder)) {
      return { ok: false, error: 'Order id din token ≠ payload — IPN respins.' };
    }
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
