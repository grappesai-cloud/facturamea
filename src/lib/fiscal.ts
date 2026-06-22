// Adaptor pentru ErpNet.FP — server HTTP local (JSON) care comandă aparatul
// fiscal (AMEF: Datecs / Daisy / Tremol / Eltrade ...). Vezi github.com/erpnet/ErpNet.FP.
//
// Driverul rulează pe MAȘINA de la casă (de regulă http://localhost:8001), deci
// toate apelurile de aici se fac DIN BROWSER, nu de pe serverul Astro (care e pe
// Coolify și nu vede localhost-ul casei). Modulul e pur client-side.
//
// Config-ul e per-aparat (per-browser), salvat în localStorage, fiindcă URL-ul
// driverului și id-ul imprimantei diferă de la o casă la alta.

const STORAGE_KEY = 'facturamea.fiscal';

export interface FiscalConfig {
  enabled: boolean;
  baseUrl: string;          // ex. http://localhost:8001
  printerId: string;        // id returnat de GET /printers
  operator?: string;        // implicit pe protocol (ex. Datecs: "1")
  operatorPassword?: string; // implicit pe protocol (ex. Datecs: "0000")
  // Mapare cotă TVA (%) -> grupa de taxă configurată pe aparat (taxGroup ErpNet.FP).
  // Valorile depind de fiscalizarea aparatului; cele de mai jos sunt un default
  // uzual RO (A=standard, B=redusă, C=5%, D=0%) și se ajustează din Setări.
  taxGroups: Record<string, number>;
}

export const DEFAULT_TAX_GROUPS: Record<string, number> = {
  '21': 1, // A — cota standard
  '19': 1,
  '11': 2, // B — cotă redusă
  '9': 2,
  '5': 3,  // C
  '0': 4,  // D — scutit / fără TVA
};

export const DEFAULT_FISCAL_CONFIG: FiscalConfig = {
  enabled: false,
  baseUrl: 'http://localhost:8001',
  printerId: '',
  operator: '1',
  operatorPassword: '0000',
  taxGroups: { ...DEFAULT_TAX_GROUPS },
};

export function getFiscalConfig(): FiscalConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_FISCAL_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_FISCAL_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_FISCAL_CONFIG,
      ...parsed,
      taxGroups: { ...DEFAULT_TAX_GROUPS, ...(parsed.taxGroups || {}) },
    };
  } catch {
    return { ...DEFAULT_FISCAL_CONFIG };
  }
}

export function saveFiscalConfig(cfg: FiscalConfig): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function isFiscalEnabled(): boolean {
  const c = getFiscalConfig();
  return !!(c.enabled && c.baseUrl && c.printerId);
}

// ── Tipuri ErpNet.FP ────────────────────────────────────────────────────

export interface FpPrinterInfo {
  id: string;
  serialNumber?: string;
  fiscalMemorySerialNumber?: string;
  manufacturer?: string;
  model?: string;
  uri?: string;
}

export interface FpResponse {
  ok?: boolean | string;
  receiptNumber?: string;
  receiptDateTime?: string;
  receiptAmount?: number;
  fiscalMemorySerialNumber?: string;
  messages?: Array<{ type?: string; code?: string; text?: string }>;
}

export interface FiscalSaleLine {
  name: string;
  quantity: number;
  unitPriceCents: number; // preț cu TVA inclus (ca la POS)
  vatRate: number;
}

export interface FiscalSale {
  receiptNumber: string;       // numărul intern (BON-xxxxxx) — folosit ca referință
  paymentMethod: string;       // cash | card | mixed
  totalCents: number;
  cashReceivedCents?: number;
  lines: FiscalSaleLine[];
}

export interface FiscalResult {
  ok: boolean;
  fiscalReceiptNumber?: string;
  fiscalSerial?: string;
  error?: string;
  raw?: FpResponse;
}

// ── Apeluri către driver ────────────────────────────────────────────────

const TIMEOUT_MS = 20000;

async function fpFetch(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Lista imprimantelor detectate de driver. GET /printers întoarce un obiect
// indexat după id; îl normalizăm la un array.
export async function listPrinters(baseUrl: string): Promise<FpPrinterInfo[]> {
  const res = await fpFetch(`${baseUrl.replace(/\/$/, '')}/printers`);
  if (!res.ok) throw new Error(`Driver indisponibil (HTTP ${res.status})`);
  const data = await res.json();
  return Object.entries<any>(data || {}).map(([id, info]) => ({ id, ...info }));
}

export async function getPrinterStatus(baseUrl: string, printerId: string): Promise<FpResponse> {
  const res = await fpFetch(`${baseUrl.replace(/\/$/, '')}/printers/${encodeURIComponent(printerId)}/status`);
  if (!res.ok) throw new Error(`Status indisponibil (HTTP ${res.status})`);
  return res.json();
}

// Raport Z (închidere zilnică) — obligatoriu fiscal la finalul zilei.
export async function printZReport(cfg: FiscalConfig): Promise<FpResponse> {
  const res = await fpFetch(`${cfg.baseUrl.replace(/\/$/, '')}/printers/${encodeURIComponent(cfg.printerId)}/zreport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Eroare raport Z (HTTP ${res.status})`);
  return res.json();
}

function buildPayments(sale: FiscalSale): Array<{ amount: number; paymentType: string }> {
  const total = (sale.totalCents || 0) / 100;
  const cashRecv = (sale.cashReceivedCents || 0) / 100;
  if (sale.paymentMethod === 'card') return [{ amount: total, paymentType: 'card' }];
  if (sale.paymentMethod === 'mixed' && cashRecv > 0 && cashRecv < total) {
    return [
      { amount: cashRecv, paymentType: 'cash' },
      { amount: Math.round((total - cashRecv) * 100) / 100, paymentType: 'card' },
    ];
  }
  return [{ amount: total, paymentType: 'cash' }];
}

// Emite bonul fiscal pe aparat. Întoarce numărul fiscal + seria memoriei fiscale.
export async function printReceipt(cfg: FiscalConfig, sale: FiscalSale): Promise<FiscalResult> {
  const items = sale.lines.map((l) => ({
    text: l.name.slice(0, 72),
    quantity: l.quantity,
    unitPrice: Math.round(l.unitPriceCents) / 100, // preț cu TVA inclus, în RON
    taxGroup: cfg.taxGroups[String(l.vatRate)] ?? 1,
  }));

  const body: Record<string, unknown> = {
    items,
    payments: buildPayments(sale),
  };
  if (cfg.operator) body.operator = cfg.operator;
  if (cfg.operatorPassword) body.operatorPassword = cfg.operatorPassword;

  let raw: FpResponse;
  try {
    const res = await fpFetch(
      `${cfg.baseUrl.replace(/\/$/, '')}/printers/${encodeURIComponent(cfg.printerId)}/receipt`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: fpErrorText(raw) || `HTTP ${res.status}`, raw };
    }
  } catch (e: any) {
    const offline = e?.name === 'AbortError'
      ? 'Driverul fiscal nu a răspuns (timeout).'
      : 'Nu mă pot conecta la driverul fiscal. Verifică dacă ErpNet.FP rulează la casă.';
    return { ok: false, error: offline };
  }

  const okFlag = raw.ok === true || raw.ok === 'true';
  if (!okFlag) return { ok: false, error: fpErrorText(raw) || 'Aparatul fiscal a respins bonul.', raw };

  return {
    ok: true,
    fiscalReceiptNumber: raw.receiptNumber,
    fiscalSerial: raw.fiscalMemorySerialNumber,
    raw,
  };
}

function fpErrorText(raw?: FpResponse): string {
  if (!raw?.messages?.length) return '';
  return raw.messages
    .filter((m) => m.type === 'error' || m.type === 'reserved')
    .map((m) => m.text)
    .filter(Boolean)
    .join('; ');
}
