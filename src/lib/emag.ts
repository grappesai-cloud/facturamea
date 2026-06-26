// eMag Marketplace API client (Marketplace API v3).
//
// Unlike WooCommerce/Shopify (push webhooks), eMag is PULL-based: we periodically
// read finalized orders, issue invoices for them, then push the invoice URL back
// onto the order so it shows up in the seller's eMag account.
//
// Auth is HTTP Basic with the seller's Marketplace API credentials. eMag also
// requires the caller IP to be whitelisted in the seller's account — so this can
// only be verified live against a real seller account (the IP of the prod host
// must be added to eMag's allowlist).
//
// Credentials are stored encrypted (AES-256-GCM) in integration_connections.config_enc
// as JSON: { username, password, platform }.
import { decryptSecret, encryptSecret } from './crypto';

export interface EmagCreds {
  username: string;
  password: string;
  platform: 'ro' | 'bg' | 'hu' | string;
}

const PLATFORM_BASE: Record<string, string> = {
  ro: 'https://marketplace-api.emag.ro/api-3',
  bg: 'https://marketplace-api.emag.bg/api-3',
  hu: 'https://marketplace-api.emag.hu/api-3',
};

export function emagBase(platform: string | undefined): string {
  return PLATFORM_BASE[(platform || 'ro').toLowerCase()] || PLATFORM_BASE.ro;
}

// Encrypt the credential bundle for storage in config_enc.
export function sealEmagCreds(creds: EmagCreds): string {
  return encryptSecret(JSON.stringify({
    username: creds.username,
    password: creds.password,
    platform: (creds.platform || 'ro').toLowerCase(),
  }));
}

// Decrypt config_enc back into credentials (null if missing/corrupt/incomplete).
export function parseEmagCreds(configEnc: string | null | undefined): EmagCreds | null {
  if (!configEnc) return null;
  try {
    const j = JSON.parse(decryptSecret(configEnc));
    if (j?.username && j?.password) {
      return { username: String(j.username), password: String(j.password), platform: String(j.platform || 'ro') };
    }
  } catch { /* corrupt / wrong key */ }
  return null;
}

function authHeader(c: EmagCreds): string {
  return 'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64');
}

// Low-level POST. eMag returns HTTP 200 with `{ isError, messages, results }`
// even for logical errors, so we surface `isError` as a thrown Error.
async function emagPost(c: EmagCreds, path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${emagBase(c.platform)}/${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(c), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`eMag ${path} HTTP ${res.status}`);
  if (data?.isError) {
    const msg = Array.isArray(data.messages) ? data.messages.join('; ') : 'eroare necunoscută';
    throw new Error(`eMag ${path}: ${msg}`);
  }
  return data;
}

export interface EmagReadOpts {
  status?: number;        // 1 new, 2 in progress, 3 prepared, 4 finalized, 5 returned
  page?: number;
  perPage?: number;
  modifiedAfter?: string; // ISO datetime — only orders changed after this
}

// Read orders for a status (default 4 = finalized, the invoiceable state).
export async function emagReadOrders(c: EmagCreds, opts: EmagReadOpts = {}): Promise<any[]> {
  const body: Record<string, unknown> = {
    status: opts.status ?? 4,
    currentPage: opts.page ?? 1,
    itemsPerPage: Math.min(Math.max(opts.perPage ?? 100, 1), 100),
  };
  if (opts.modifiedAfter) body.modifiedAfter = opts.modifiedAfter;
  const data = await emagPost(c, 'order/read', body);
  return Array.isArray(data?.results) ? data.results : [];
}

// Attach the issued invoice (public URL) back onto the eMag order. type 1 = invoice.
export async function emagAttachInvoice(c: EmagCreds, orderId: string | number, invoiceUrl: string, name = 'Factura'): Promise<void> {
  await emagPost(c, 'order/attachments/save', {
    order_id: orderId,
    name: name.slice(0, 90),
    url: invoiceUrl,
    type: 1,
  });
}

// Lightweight credential check used by the "Testează" button — reads page 1 of
// finalized orders; a thrown error means bad creds / IP not whitelisted.
export async function emagTestConnection(c: EmagCreds): Promise<{ ok: true; count: number }> {
  const rows = await emagReadOrders(c, { status: 4, page: 1, perPage: 1 });
  return { ok: true, count: rows.length };
}
