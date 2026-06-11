// Bank statement parsers (extras de cont) for the reconciliation module.
// Supports Romanian-bank CSV exports and a best-effort MT940 parse.
// Money is always coerced to integer cents (+ incoming, - outgoing).
//
// This module is intentionally dependency-free (no XLSX, no external CSV lib)
// so it stays cheap and safe to run on the edge/serverless runtime.

export interface ParsedRow {
  bookingDate?: string;        // ISO yyyy-mm-dd
  amountCents: number;         // + incoming, - outgoing
  description?: string;
  counterparty?: string;
  counterpartyIban?: string;
  reference?: string;
  externalId?: string;         // stable dedupe key
}

export interface ParseResult {
  rows: ParsedRow[];
  format: 'csv' | 'mt940' | 'unknown';
  warnings: string[];
}

// Cap how many rows we ever return so a malformed/huge file cannot blow memory.
export const MAX_STATEMENT_ROWS = 5000;

// ──────────────────────────────────────────────────────────────────────────
// Small utilities
// ──────────────────────────────────────────────────────────────────────────

function toText(buffer: Buffer | Uint8Array | ArrayBuffer | string): string {
  if (typeof buffer === 'string') return buffer;
  try {
    const bytes =
      buffer instanceof ArrayBuffer ? new Uint8Array(buffer)
      : buffer instanceof Uint8Array ? buffer
      : new Uint8Array(buffer as any);
    // Strip a UTF-8 BOM if present.
    let start = 0;
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(start));
  } catch {
    return '';
  }
}

// Parse Romanian / mixed money strings into integer cents.
// Handles "1.234,56", "1,234.56", "1234,56", "1234.56", "(123,45)" (negative),
// trailing currency, leading sign, and stray spaces / NBSP.
export function parseMoneyToCents(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw * 100);
  let s = String(raw).trim();
  if (!s) return 0;

  let negative = false;
  // Accounting negatives in parentheses.
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }

  // Keep digits, separators and sign only.
  s = s.replace(/[^\d,.\-+]/g, '');
  if (!s || s === '-' || s === '+') return 0;
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  let normalized: string;
  if (hasComma && hasDot) {
    // The last separator is the decimal one; the other is a thousands grouping.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      normalized = s.replace(/\./g, '').replace(',', '.');   // RO: 1.234,56
    } else {
      normalized = s.replace(/,/g, '');                       // EN: 1,234.56
    }
  } else if (hasComma) {
    const parts = s.split(',');
    // "1,234,567" => grouping; "1234,56" => decimal.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0)) {
      normalized = parts.join('');
    } else {
      normalized = s.replace(',', '.');
    }
  } else {
    normalized = s; // only dots or plain digits
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return 0;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

// Coerce a wide range of RO date formats to ISO yyyy-mm-dd. Returns undefined
// when nothing sensible can be extracted.
export function parseDateToIso(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  // Drop a trailing time component if present.
  s = s.split(/[ T]/)[0];

  // Already ISO.
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;

  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy (RO bank default).
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) >= 70 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // yyyy/mm/dd or yyyy.mm.dd.
  m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MT940 :61: date -> yymmdd.
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const [, yy, mo, d] = m;
    const y = (Number(yy) >= 70 ? '19' : '20') + yy;
    return `${y}-${mo}-${d}`;
  }

  return undefined;
}

// Simple stable 32-bit hash (FNV-1a-ish) rendered as base36, for dedupe keys.
function hashKey(parts: (string | number | undefined)[]): string {
  const s = parts.map((p) => (p == null ? '' : String(p))).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned, base36.
  return (h >>> 0).toString(36);
}

function makeExternalId(row: ParsedRow): string {
  return 'h_' + hashKey([row.bookingDate, row.amountCents, row.reference, row.counterparty, row.description?.slice(0, 64)]);
}

// ──────────────────────────────────────────────────────────────────────────
// CSV parsing (RFC-ish, quote aware, delimiter auto-detected)
// ──────────────────────────────────────────────────────────────────────────

function detectDelimiter(headerLine: string): string {
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  const tabs = (headerLine.match(/\t/g) || []).length;
  if (tabs > semis && tabs > commas) return '\t';
  // RO banks lean on ';' because the comma is the decimal separator.
  if (semis >= commas) return ';';
  return ',';
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Header keyword sets (lower-cased, diacritics already folded).
const H = {
  date: ['data', 'data tranzactie', 'data operatiunii', 'data inregistrare', 'booking date', 'date', 'data valutei', 'data procesarii'],
  amount: ['suma', 'valoare', 'amount', 'suma tranzactie'],
  debit: ['debit', 'plati', 'plata', 'iesiri', 'iesire', 'sume debit'],
  credit: ['credit', 'incasari', 'incasare', 'intrari', 'intrare', 'sume credit'],
  description: ['detalii', 'descriere', 'explicatii', 'explicatie', 'detalii tranzactie', 'description', 'mentiuni'],
  counterparty: ['beneficiar', 'platitor', 'ordonator', 'partener', 'contrapartida', 'nume', 'beneficiar/platitor', 'counterparty'],
  iban: ['iban', 'cont', 'iban beneficiar', 'iban partener', 'cont partener', 'cont beneficiar'],
  reference: ['referinta', 'referinta tranzactie', 'numar referinta', 'id tranzactie', 'reference', 'nr. ref', 'nr ref'],
};

function foldHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find the first column index whose folded header matches one of the keywords.
// Exact match wins over a contains-match to avoid e.g. "data valutei" stealing.
function findCol(headers: string[], keywords: string[]): number {
  const folded = headers.map(foldHeader);
  for (const kw of keywords) {
    const idx = folded.indexOf(kw);
    if (idx >= 0) return idx;
  }
  for (let i = 0; i < folded.length; i++) {
    if (keywords.some((kw) => folded[i].includes(kw))) return i;
  }
  return -1;
}

function looksLikeIban(s: string | undefined): boolean {
  if (!s) return false;
  const c = s.replace(/\s+/g, '');
  return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/i.test(c);
}

function parseCsv(text: string, warnings: string[]): ParsedRow[] {
  const rawLines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) return [];

  // Some exports prepend metadata lines before the real header. Find the line
  // that most plausibly contains "data" + an amount-ish keyword.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawLines.length, 15); i++) {
    const f = foldHeader(rawLines[i]);
    if (f.includes('data') && (f.includes('suma') || f.includes('debit') || f.includes('credit') || f.includes('valoare'))) {
      headerIdx = i; break;
    }
  }

  const delim = detectDelimiter(rawLines[headerIdx]);
  const headers = splitCsvLine(rawLines[headerIdx], delim);

  const cDate = findCol(headers, H.date);
  const cAmount = findCol(headers, H.amount);
  const cDebit = findCol(headers, H.debit);
  const cCredit = findCol(headers, H.credit);
  const cDesc = findCol(headers, H.description);
  const cParty = findCol(headers, H.counterparty);
  const cIban = findCol(headers, H.iban);
  const cRef = findCol(headers, H.reference);

  if (cAmount < 0 && cDebit < 0 && cCredit < 0) {
    warnings.push('Nu am găsit o coloană de sumă (Suma / Debit / Credit). Verifică formatul fișierului.');
  }

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < rawLines.length && rows.length < MAX_STATEMENT_ROWS; i++) {
    const cells = splitCsvLine(rawLines[i], delim);
    const at = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx] : '');

    // Amount: prefer split debit/credit columns when present.
    let amountCents = 0;
    if (cDebit >= 0 || cCredit >= 0) {
      const debit = parseMoneyToCents(at(cDebit));
      const credit = parseMoneyToCents(at(cCredit));
      // debit reduces balance (outgoing => negative), credit is incoming.
      amountCents = credit - Math.abs(debit);
    } else if (cAmount >= 0) {
      amountCents = parseMoneyToCents(at(cAmount));
    }

    const bookingDate = parseDateToIso(at(cDate));
    // Skip empty / non-transaction rows (e.g. totals, blank trailing lines).
    if (amountCents === 0 && !bookingDate) continue;

    const description = at(cDesc) || undefined;
    let counterparty = at(cParty) || undefined;
    let counterpartyIban = at(cIban) || undefined;
    // If the "iban" column actually holds a name and vice-versa, swap-detect.
    if (!looksLikeIban(counterpartyIban) && looksLikeIban(counterparty)) {
      [counterparty, counterpartyIban] = [counterpartyIban, counterparty];
    }
    const reference = at(cRef) || undefined;

    const row: ParsedRow = {
      bookingDate,
      amountCents,
      description: clip(description, 2000),
      counterparty: clip(counterparty, 200),
      counterpartyIban: counterpartyIban ? clip(counterpartyIban.replace(/\s+/g, ''), 40) : undefined,
      reference: clip(reference, 120),
    };
    row.externalId = makeExternalId(row);
    rows.push(row);
  }

  return rows;
}

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

// ──────────────────────────────────────────────────────────────────────────
// MT940 (best-effort) — :61: statement line + :86: information to account owner
// ──────────────────────────────────────────────────────────────────────────

// :61:YYMMDD[MMDD]{C|D|RC|RD}amount... — we read the value date, sign and amount.
function parse61(line: string): { date?: string; amountCents: number } | null {
  // Example: :61:2406030603C1234,56NTRFNONREF//...
  const m = line.match(/^:61:(\d{6})(\d{4})?(R?[CD])([\d.,]+)/i);
  if (!m) return null;
  const [, yymmdd, , dc, amt] = m;
  const date = parseDateToIso(yymmdd);
  // C = credit (incoming, +), D = debit (outgoing, -); RC/RD reverse the sense.
  const isCredit = dc.toUpperCase() === 'C' || dc.toUpperCase() === 'RD';
  const value = Math.abs(parseMoneyToCents(amt));
  return { date, amountCents: isCredit ? value : -value };
}

// Extract counterparty / reference from a :86: structured-ish block.
function parse86(block: string): { description?: string; counterparty?: string; reference?: string; iban?: string } {
  const flat = block.replace(/\r?\n/g, ' ').trim();
  const out: { description?: string; counterparty?: string; reference?: string; iban?: string } = {};
  // SWIFT subfields like ?20..?29 = remittance, ?32/?33 = name, ?38 = IBAN.
  const sub: Record<string, string> = {};
  const re = /\?(\d{2})([^?]*)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(flat))) sub[mm[1]] = (sub[mm[1]] || '') + mm[2].trim() + ' ';
  const remit = Object.keys(sub).filter((k) => k >= '20' && k <= '29').map((k) => sub[k]).join(' ').trim();
  const name = ((sub['32'] || '') + (sub['33'] || '')).trim();
  const iban = (sub['38'] || '').trim();

  if (Object.keys(sub).length > 0) {
    out.description = clip(remit || flat, 2000);
    out.counterparty = clip(name, 200);
    out.iban = looksLikeIban(iban) ? clip(iban.replace(/\s+/g, ''), 40) : undefined;
  } else {
    out.description = clip(flat, 2000);
  }
  // Pull a NONREF/EREF-style reference token if any.
  const refMatch = flat.match(/(?:EREF|KREF|NONREF|REF)[:+]?\s*([A-Z0-9\-/]+)/i);
  if (refMatch) out.reference = clip(refMatch[1], 120);
  return out;
}

function parseMt940(text: string, warnings: string[]): ParsedRow[] {
  const lines = text.split(/\r\n|\r|\n/);
  const rows: ParsedRow[] = [];
  let pending: { date?: string; amountCents: number } | null = null;
  let info: string[] = [];

  const flush = () => {
    if (!pending) return;
    const meta = parse86(info.join('\n'));
    const row: ParsedRow = {
      bookingDate: pending.date,
      amountCents: pending.amountCents,
      description: meta.description,
      counterparty: meta.counterparty,
      counterpartyIban: meta.iban,
      reference: meta.reference,
    };
    row.externalId = makeExternalId(row);
    rows.push(row);
    pending = null;
    info = [];
  };

  for (const raw of lines) {
    if (rows.length >= MAX_STATEMENT_ROWS) break;
    if (raw.startsWith(':61:')) {
      flush();
      pending = parse61(raw);
      if (!pending) warnings.push('Linie :61: neinterpretabilă a fost ignorată.');
    } else if (raw.startsWith(':86:')) {
      if (pending) info.push(raw.slice(4));
    } else if (pending && info.length > 0 && !raw.startsWith(':')) {
      // Continuation of the :86: block.
      info.push(raw);
    }
  }
  flush();
  return rows;
}

// ──────────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────────

export function parseStatement(
  buffer: Buffer | Uint8Array | ArrayBuffer | string,
  filename?: string,
): ParseResult {
  const warnings: string[] = [];
  const text = toText(buffer);
  if (!text.trim()) return { rows: [], format: 'unknown', warnings: ['Fișier gol sau ilizibil.'] };

  const name = (filename || '').toLowerCase();
  const looksMt940 =
    name.endsWith('.sta') || name.endsWith('.mt940') || name.endsWith('.940') ||
    /^:\d{2}[A-Z]?:/m.test(text) || text.includes(':61:');

  let rows: ParsedRow[];
  let format: ParseResult['format'];
  if (looksMt940) {
    rows = parseMt940(text, warnings);
    format = 'mt940';
    // Fall back to CSV if MT940 yielded nothing useful.
    if (rows.length === 0) {
      const csvRows = parseCsv(text, warnings);
      if (csvRows.length > 0) { rows = csvRows; format = 'csv'; }
    }
  } else {
    rows = parseCsv(text, warnings);
    format = rows.length > 0 ? 'csv' : 'unknown';
  }

  // Ensure every row has a stable externalId (parsers already set it, but guard).
  for (const r of rows) if (!r.externalId) r.externalId = makeExternalId(r);

  return { rows, format, warnings };
}
