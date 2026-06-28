// Heuristic parser: turns raw OCR text (from on-device Vision OCR) into expense
// fields. Free, no AI. Tuned for Romanian receipts/invoices (bon fiscal, factură).
// It is best-effort — the scan UI shows every field editable so the user fixes
// whatever the heuristics miss. Matches the OcrFields shape in ReceiptScanner.tsx.

export interface ParsedReceipt {
  supplierName: string | null;
  supplierCui: string | null;
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  netCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  category: string | null;
}

const EMPTY: ParsedReceipt = {
  supplierName: null, supplierCui: null, documentNumber: null, issueDate: null,
  netCents: 0, vatCents: 0, totalCents: 0, currency: 'RON', category: null,
};

// "1.234,56" → 1234.56 · "1234,56" → 1234.56 · "1234.56" → 1234.56 · "123" → 123
function parseAmount(s: string): number | null {
  let t = s.replace(/[^\d.,]/g, '');
  if (!t) return null;
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  if (hasComma && hasDot) {
    // Last separator is the decimal one; the other groups thousands.
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (hasComma) {
    t = t.replace(',', '.');
  } else if (hasDot) {
    // A lone dot with >2 trailing digits is a thousands separator, not decimal.
    const after = t.split('.').pop() || '';
    if (after.length === 3 && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Largest monetary-looking number on a line (totals usually are the biggest).
function amountsOnLine(line: string): number[] {
  const out: number[] = [];
  const re = /\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})|\d+[.,]\d{1,2}|\d+/g;
  for (const m of line.match(re) || []) {
    const v = parseAmount(m);
    if (v != null && v > 0) out.push(v);
  }
  return out;
}

function toIso(d: string): string | null {
  // dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy  (also 2-digit year)
  let m = d.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/);
  if (m) {
    let [, dd, mm, yy] = m;
    let year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  m = d.match(/\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}

const ROUND = (n: number) => Math.round(n * 100);

export function parseReceiptText(text: string): ParsedReceipt {
  if (!text || !text.trim()) return { ...EMPTY };
  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const upper = rawLines.map((l) => l.toUpperCase());
  const r: ParsedReceipt = { ...EMPTY };

  // --- CUI / CIF -----------------------------------------------------------
  const cuiMatch = text.match(/\b(?:C\.?U\.?I\.?|C\.?I\.?F\.?|COD\s+FISCAL)[\s:.\-]{0,4}(RO)?\s*(\d{2,10})\b/i);
  if (cuiMatch) r.supplierCui = `${cuiMatch[1] ? 'RO' : ''}${cuiMatch[2]}`;

  // --- Date ----------------------------------------------------------------
  for (const l of rawLines) {
    const iso = toIso(l);
    if (iso) { r.issueDate = iso; break; }
  }

  // --- Document number -----------------------------------------------------
  const docMatch = text.match(/\b(?:BON(?:\s+FISCAL)?|FACTUR[ĂA]|NR\.?|SERIA?|NUM[ĂA]R)\D{0,6}([A-Z0-9][A-Z0-9\-\/]{1,18})\b/i);
  if (docMatch && /\d/.test(docMatch[1])) r.documentNumber = docMatch[1];

  // --- Total / VAT / Net ---------------------------------------------------
  let total: number | null = null;
  let vat: number | null = null;
  let net: number | null = null;
  let vatRate: number | null = null;

  // Percentages ("9%", "21 %") must never count as money amounts.
  const stripPct = (s: string) => s.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
  for (let i = 0; i < upper.length; i++) {
    const u = upper[i];
    const amounts = amountsOnLine(stripPct(rawLines[i]));
    const nextAmounts = i + 1 < rawLines.length ? amountsOnLine(stripPct(rawLines[i + 1])) : [];
    const isFaraTva = /F[ĂA]R[ĂA]\s+TVA/.test(u);

    if (total == null && /(TOTAL\s*DE\s*PLAT|TOTAL\s*LEI|TOTAL\s*:|^TOTAL\b|SUMA\s*DE\s*PLAT)/.test(u)) {
      const pick = amounts.length ? Math.max(...amounts) : (nextAmounts.length ? Math.max(...nextAmounts) : null);
      if (pick != null) total = pick;
    }
    // A real VAT line ("TVA 9% ..."), not a "valoare fără TVA" base line.
    if (/\bTVA\b/.test(u) && !isFaraTva) {
      const rate = u.match(/(\d{1,2})\s*%/);
      if (rate) vatRate = Number(rate[1]);
      if (vat == null && amounts.length) vat = Math.max(...amounts);
    }
    if (net == null && (isFaraTva || /BAZ[ĂA]|SUBTOTAL/.test(u)) && amounts.length) {
      net = Math.max(...amounts);
    }
  }

  // Fallback: biggest amount in the whole document is almost always the total.
  if (total == null) {
    const all: number[] = [];
    for (const l of rawLines) all.push(...amountsOnLine(l));
    const plausible = all.filter((a) => a >= 1 && a < 1e7);
    if (plausible.length) total = Math.max(...plausible);
  }

  // Reconcile the three values.
  if (net != null && vat != null && total == null) total = net + vat;
  if (total != null && vat != null && net == null) net = Math.max(0, total - vat);
  if (total != null && net == null && vat == null && vatRate) {
    const base = total / (1 + vatRate / 100);
    net = base; vat = total - base;
  }

  if (total != null) r.totalCents = ROUND(total);
  if (net != null) r.netCents = ROUND(net);
  if (vat != null) r.vatCents = ROUND(vat);

  // --- Supplier name -------------------------------------------------------
  // First "name-like" line near the top: mostly letters, not an address/code.
  for (const l of rawLines.slice(0, 6)) {
    const letters = (l.match(/[A-Za-zĂÂÎȘȚăâîșț]/g) || []).length;
    if (letters >= 3 && l.length <= 42 && !/^\d/.test(l) &&
        !/(STR\.|BD\.|NR\.|CUI|CIF|TEL|FACTUR|BON|TOTAL|RON|LEI)/i.test(l)) {
      r.supplierName = l.replace(/\s{2,}/g, ' ').trim();
      break;
    }
  }

  return r;
}
