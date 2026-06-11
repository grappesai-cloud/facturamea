// ─── Data-import parsers ──────────────────────────────────────────────────
//
// Shared, side-effect-free helpers used by the import wizard + its API routes.
// Parses CSV/XLSX uploads into a normalised { headers, rows } shape, suggests
// a column→field mapping from known Oblio / SmartBill / FGO export layouts,
// and coerces Romanian money/date strings into the canonical formats the rest
// of the app expects (INTEGER cents, ISO dates).
//
// No DB access here. Everything is pure so it can be unit-tested and reused
// by both /api/import/preview and /api/import/commit.

export type ImportEntity = 'clients' | 'products' | 'invoices';
export type ImportSource = 'oblio' | 'smartbill' | 'fgo' | 'csv';

export interface TabularData {
  headers: string[];
  rows: Record<string, string>[];
}

// ─── Target fields per entity ───────────────────────────────────────────────
// `key` is the facturamea field name written by the commit route. `label` is
// the Romanian copy shown in the mapping dropdowns. `required` flags the field
// the row cannot be imported without.

export interface TargetField {
  key: string;
  label: string;
  required?: boolean;
}

export const TARGET_FIELDS: Record<ImportEntity, TargetField[]> = {
  clients: [
    { key: 'name', label: 'Denumire / Nume', required: true },
    { key: 'taxId', label: 'CUI / CIF' },
    { key: 'registryNumber', label: 'Nr. Reg. Com. (J)' },
    { key: 'address', label: 'Adresă' },
    { key: 'city', label: 'Oraș' },
    { key: 'county', label: 'Județ' },
    { key: 'country', label: 'Țară' },
    { key: 'postalCode', label: 'Cod poștal' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefon' },
    { key: 'contactName', label: 'Persoană contact' },
    { key: 'iban', label: 'IBAN' },
    { key: 'bank', label: 'Bancă' },
  ],
  products: [
    { key: 'name', label: 'Denumire', required: true },
    { key: 'code', label: 'Cod' },
    { key: 'description', label: 'Descriere' },
    { key: 'defaultUnitPriceCents', label: 'Preț unitar' },
    { key: 'defaultCurrency', label: 'Monedă' },
    { key: 'defaultUm', label: 'UM' },
    { key: 'defaultVatRate', label: 'Cotă TVA (%)' },
    { key: 'productType', label: 'Tip produs' },
  ],
  invoices: [
    { key: 'series', label: 'Serie' },
    { key: 'number', label: 'Număr', required: true },
    { key: 'issuedAt', label: 'Data emiterii' },
    { key: 'dueAt', label: 'Data scadenței' },
    { key: 'clientName', label: 'Client', required: true },
    { key: 'clientTaxId', label: 'CUI client' },
    { key: 'clientAddress', label: 'Adresă client' },
    { key: 'currency', label: 'Monedă' },
    { key: 'subtotal', label: 'Subtotal (fără TVA)' },
    { key: 'vat', label: 'Valoare TVA' },
    { key: 'total', label: 'Total' },
    { key: 'paid', label: 'Încasat' },
    { key: 'status', label: 'Status' },
    { key: 'description', label: 'Descriere produs/serviciu' },
    { key: 'quantity', label: 'Cantitate' },
    { key: 'unit', label: 'UM' },
    { key: 'unitPrice', label: 'Preț unitar' },
    { key: 'vatRate', label: 'Cotă TVA (%)' },
  ],
};

// ─── Known-header presets ────────────────────────────────────────────────────
// Maps the (normalised) header text from real RO exports to a target field.
// Headers are matched case/diacritic-insensitively (see `normHeader`). Where a
// field has several common spellings we list them all. Source-specific presets
// override the generic ones; unknown columns simply stay unmapped.

type PresetMap = Record<string, string>; // normalisedHeader -> fieldKey

const CLIENT_PRESET: PresetMap = {
  denumire: 'name',
  nume: 'name',
  'nume client': 'name',
  client: 'name',
  'denumire client': 'name',
  'denumire firma': 'name',
  cui: 'taxId',
  cif: 'taxId',
  'cod fiscal': 'taxId',
  'cui/cif': 'taxId',
  'nr inreg': 'registryNumber',
  'nr reg com': 'registryNumber',
  'registru comert': 'registryNumber',
  rc: 'registryNumber',
  adresa: 'address',
  'adresa completa': 'address',
  oras: 'city',
  localitate: 'city',
  judet: 'county',
  tara: 'country',
  'cod postal': 'postalCode',
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  telefon: 'phone',
  tel: 'phone',
  'persoana contact': 'contactName',
  contact: 'contactName',
  iban: 'iban',
  cont: 'iban',
  banca: 'bank',
};

const PRODUCT_PRESET: PresetMap = {
  denumire: 'name',
  'denumire produs': 'name',
  nume: 'name',
  produs: 'name',
  cod: 'code',
  'cod produs': 'code',
  sku: 'code',
  descriere: 'description',
  pret: 'defaultUnitPriceCents',
  'pret unitar': 'defaultUnitPriceCents',
  'pret vanzare': 'defaultUnitPriceCents',
  'pret fara tva': 'defaultUnitPriceCents',
  moneda: 'defaultCurrency',
  valuta: 'defaultCurrency',
  um: 'defaultUm',
  'u.m.': 'defaultUm',
  'unitate masura': 'defaultUm',
  tva: 'defaultVatRate',
  'cota tva': 'defaultVatRate',
  'tva %': 'defaultVatRate',
  tip: 'productType',
  'tip produs': 'productType',
};

const INVOICE_PRESET: PresetMap = {
  serie: 'series',
  'serie factura': 'series',
  numar: 'number',
  'numar factura': 'number',
  nr: 'number',
  'nr factura': 'number',
  data: 'issuedAt',
  'data emiterii': 'issuedAt',
  'data factura': 'issuedAt',
  'data emitere': 'issuedAt',
  scadenta: 'dueAt',
  'data scadenta': 'dueAt',
  'data scadentei': 'dueAt',
  termen: 'dueAt',
  client: 'clientName',
  'nume client': 'clientName',
  'denumire client': 'clientName',
  beneficiar: 'clientName',
  'cui client': 'clientTaxId',
  'cif client': 'clientTaxId',
  cui: 'clientTaxId',
  cif: 'clientTaxId',
  'adresa client': 'clientAddress',
  moneda: 'currency',
  valuta: 'currency',
  subtotal: 'subtotal',
  'valoare fara tva': 'subtotal',
  'baza impozitare': 'subtotal',
  tva: 'vat',
  'valoare tva': 'vat',
  total: 'total',
  'total factura': 'total',
  'total cu tva': 'total',
  'valoare totala': 'total',
  incasat: 'paid',
  achitat: 'paid',
  'suma incasata': 'paid',
  status: 'status',
  stare: 'status',
  'status plata': 'status',
  descriere: 'description',
  produs: 'description',
  'denumire produs': 'description',
  cantitate: 'quantity',
  cant: 'quantity',
  um: 'unit',
  'pret unitar': 'unitPrice',
  pret: 'unitPrice',
  'cota tva': 'vatRate',
  'tva %': 'vatRate',
};

const GENERIC_PRESETS: Record<ImportEntity, PresetMap> = {
  clients: CLIENT_PRESET,
  products: PRODUCT_PRESET,
  invoices: INVOICE_PRESET,
};

// Source-specific overrides. Most RO platforms share the generic header names
// above, so these only cover the few quirks worth pinning down. Anything not
// listed here falls through to GENERIC_PRESETS + fuzzy matching.
export const PRESETS: Record<ImportSource, Record<ImportEntity, PresetMap>> = {
  oblio: {
    clients: { ...CLIENT_PRESET, 'cod client': 'taxId' },
    products: { ...PRODUCT_PRESET, 'pret cu tva': 'defaultUnitPriceCents' },
    invoices: { ...INVOICE_PRESET, 'serie/numar': 'number', incasari: 'paid' },
  },
  smartbill: {
    clients: { ...CLIENT_PRESET, 'cod tert': 'taxId', tert: 'name' },
    products: { ...PRODUCT_PRESET, 'pret unitar fara tva': 'defaultUnitPriceCents' },
    invoices: { ...INVOICE_PRESET, 'numar document': 'number', 'data document': 'issuedAt' },
  },
  fgo: {
    clients: { ...CLIENT_PRESET, firma: 'name' },
    products: { ...PRODUCT_PRESET, articol: 'name' },
    invoices: { ...INVOICE_PRESET, 'nr document': 'number', emitere: 'issuedAt' },
  },
  csv: GENERIC_PRESETS,
};

// ─── Header normalisation + fuzzy matching ────────────────────────────────────

export function normHeader(h: string): string {
  return (h || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Suggest a mapping { sourceHeader -> fieldKey } using presets first, then a
// loose substring match against the target-field labels. Best-effort: unknown
// headers are omitted, and a field is never mapped to two source columns.
export function autoMap(
  headers: string[],
  entity: ImportEntity,
  source: ImportSource,
): Record<string, string> {
  const preset = { ...GENERIC_PRESETS[entity], ...(PRESETS[source]?.[entity] || {}) };
  const fields = TARGET_FIELDS[entity];
  const used = new Set<string>();
  const mapping: Record<string, string> = {};

  for (const raw of headers) {
    const key = normHeader(raw);
    if (!key) continue;

    // 1) exact preset hit
    let field = preset[key];

    // 2) fuzzy: the header contains (or is contained by) a known preset key
    if (!field) {
      for (const [pk, pf] of Object.entries(preset)) {
        if (key === pk || key.includes(pk) || pk.includes(key)) {
          field = pf;
          break;
        }
      }
    }

    // 3) fall back to the field label itself
    if (!field) {
      for (const f of fields) {
        const lbl = normHeader(f.label);
        if (key === lbl || key.includes(lbl) || lbl.includes(key)) {
          field = f.key;
          break;
        }
      }
    }

    if (field && !used.has(field)) {
      mapping[raw] = field;
      used.add(field);
    }
  }
  return mapping;
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────
// Hand-rolled because RO exports mix `,` and `;` separators and quote cells
// containing the separator. We auto-detect the delimiter from the header line.

function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of headerLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  // Prefer `;` (most common in RO/Excel exports) when it ties or wins.
  if (counts[';'] >= counts[','] && counts[';'] >= counts['\t'] && counts[';'] > 0) return ';';
  if (counts['\t'] > counts[','] && counts['\t'] > 0) return '\t';
  return ',';
}

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Split a CSV blob into logical rows, honouring quoted newlines.
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++; // CRLF
      rows.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function parseCsv(text: string): TabularData {
  // Strip a leading UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = splitCsvRows(text).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim).map((h) => h.trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── XLSX parsing ─────────────────────────────────────────────────────────────

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    // ISO date (no time) — matches how dates are coerced elsewhere here.
    return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

async function parseXlsx(buffer: Buffer): Promise<TabularData> {
  // read-excel-file/node returns rows as arrays of cell values.
  const { default: readXlsxFile } = await import('read-excel-file/node');
  const sheet = (await readXlsxFile(buffer)) as unknown as unknown[][];
  if (!sheet || sheet.length === 0) return { headers: [], rows: [] };

  const headers = (sheet[0] || []).map((h) => cellToString(h));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < sheet.length; i++) {
    const cells = sheet[i] || [];
    // Skip fully empty rows.
    if (cells.every((c) => cellToString(c) === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cellToString(cells[idx]);
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Public: parse any uploaded tabular file ──────────────────────────────────

export async function parseTabular(buffer: Buffer, filename: string): Promise<TabularData> {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseXlsx(buffer);
  }
  // Default to CSV/TSV text parsing.
  return parseCsv(buffer.toString('utf-8'));
}

// ─── Value coercion helpers ───────────────────────────────────────────────────

// Convert a RON money string to integer cents.
//   "1.234,56" -> 123456   "1234.56" -> 123456   "1,234.56" -> 123456
//   "1234"     -> 123400   ""/null   -> null
export function moneyToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Drop currency symbols / letters / spaces, keep digits, separators, sign.
  s = s.replace(/[^\d.,-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let normalized: string;
  if (lastComma !== -1 && lastDot !== -1) {
    // The right-most separator is the decimal one; the other is a thousands sep.
    if (lastComma > lastDot) {
      // European: 1.234,56
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,234.56
      normalized = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    // Only commas — decimal if it looks like a 1-2 digit fraction, else thousands.
    const after = s.length - lastComma - 1;
    normalized = after === 1 || after === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    // Only dots. A single dot with exactly 3 trailing digits in RO exports is a
    // thousands separator ("1.200" = 1200), not a decimal. Multiple dots are
    // always thousands. Otherwise treat the dot as the decimal point.
    const dotCount = (s.match(/\./g) || []).length;
    const after = s.length - lastDot - 1;
    if (dotCount > 1 || after === 3) {
      normalized = s.replace(/\./g, '');
    } else {
      normalized = s;
    }
  } else {
    normalized = s; // plain integer
  }

  const n = parseFloat(normalized);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Parse a plain number (quantity, VAT %) tolerating RO decimal commas.
export function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const cents = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,(?=\d{3}\b)/g, '');
  const n = parseFloat(cents);
  return Number.isFinite(n) ? n : null;
}

// Coerce a date string (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.) to a Date.
// Returns null when unparseable.
export function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;

  // ISO first.
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, +m[2] - 1, +m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Map a free-text status onto the transport_invoices status vocabulary.
export function normalizeInvoiceStatus(raw: unknown): string {
  const s = normHeader(String(raw ?? ''));
  if (!s) return 'issued';
  if (/(incasat|achitat|platit|paid|platita)/.test(s)) return 'paid';
  if (/(partial)/.test(s)) return 'partial';
  if (/(restant|depasit|overdue|scadent)/.test(s)) return 'overdue';
  if (/(anulat|stornat|void)/.test(s)) return 'voided';
  if (/(ciorna|draft)/.test(s)) return 'draft';
  if (/(trimis|sent)/.test(s)) return 'sent';
  return 'issued';
}

// Apply a mapping to one source row -> a { fieldKey: rawValue } object.
export function mapRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [sourceHeader, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey) continue;
    const v = row[sourceHeader];
    if (v !== undefined && v !== '') out[fieldKey] = v;
  }
  return out;
}

export const SOURCE_LABELS: Record<ImportSource, string> = {
  oblio: 'Oblio',
  smartbill: 'SmartBill',
  fgo: 'FGO',
  csv: 'CSV / Excel generic',
};

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  clients: 'Clienți',
  products: 'Produse',
  invoices: 'Facturi',
};

export const MAX_IMPORT_ROWS = 5000;
