// Non-AI expense extraction from a PDF's text layer. Most digital invoices
// (incl. foreign ones) carry a text layer — we read it with pdf-parse (pure JS),
// find the supplier CUI (validated, then enriched via the free ANAF lookup) and
// the total / date / number with heuristics. No AI, no per-document cost.
// Scanned PDFs (no text layer) return ok:false so the caller can fall back.
import { isValidCui } from './utils';
import { lookupAnaf } from './anaf-lookup';

export interface PdfExpenseFields {
  supplierName: string | null;
  supplierCui: string | null;
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  currency: string; // RON | EUR | USD | ...
  netCents: number;
  vatCents: number;
  totalCents: number;
  category: string | null;
  lineCount: number;
}
export type PdfExpenseResult = { ok: true; fields: PdfExpenseFields } | { ok: false; error: string };

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes });
  const res = await parser.getText();
  return res?.text || '';
}

// "1.190,50" or "1190.50" or "1,190.50" → cents.
function toCents(raw: string): number {
  let s = raw.trim().replace(/[^\d.,]/g, '');
  if (!s) return 0;
  // If both separators, the last one is the decimal separator.
  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    // Comma as decimal if it has exactly 2 trailing digits, else thousands.
    s = /,\d{2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export async function parseExpensePdf(bytes: Uint8Array, ownCui?: string | null): Promise<PdfExpenseResult> {
  let text = '';
  try { text = await extractPdfText(bytes); } catch { return { ok: false, error: 'pdf-no-text' }; }
  // Scanned image / no text layer → not enough to parse.
  if (!text || text.replace(/\s+/g, '').length < 25) return { ok: false, error: 'pdf-no-text' };
  return parseExpenseText(text, ownCui);
}

// Currency tokens we recognise (code or symbol) → ISO code.
const CUR_RE = /(RON|LEI|EUR(?:O)?|USD|US\$|GBP|CHF|HUF|BGN|PLN|MDL|TRY|€|£|\$)/i;
function normCur(tok: string): string | null {
  const t = tok.toUpperCase().replace(/\s/g, '');
  if (t === 'RON' || t === 'LEI') return 'RON';
  if (t === 'EUR' || t === 'EURO' || t === '€') return 'EUR';
  if (t === 'USD' || t === 'US$' || t === '$') return 'USD';
  if (t === 'GBP' || t === '£') return 'GBP';
  if (['CHF', 'HUF', 'BGN', 'PLN', 'MDL', 'TRY'].includes(t)) return t;
  return null;
}
const AMT = String.raw`\d[\d.,]*\d|\d`; // a number (1.190,50 / 1190.50 / 5)

// Parse invoice fields from already-extracted text — shared by the PDF text-layer
// reader and the Tesseract image OCR.
export async function parseExpenseText(text: string, ownCui?: string | null): Promise<PdfExpenseResult> {
  const own = (ownCui || '').replace(/^RO/i, '').replace(/\D/g, '');

  // --- Supplier CUI: validated CUIs in the text, excluding the buyer (our own). ---
  const candidates = [...text.matchAll(/\b(?:RO\s?)?(\d{2,10})\b/gi)]
    .map((m) => m[1]).filter((c) => isValidCui(c));
  const uniq = Array.from(new Set(candidates));
  const supplierCui = uniq.find((c) => c !== own) || uniq[0] || null;

  // --- Currency: tally every currency token; the most frequent wins (default RON).
  //     Foreign invoices that also print a RON equivalent still skew to the real
  //     currency because every line/total carries it. ---
  const curCounts: Record<string, number> = {};
  for (const m of text.matchAll(new RegExp(CUR_RE, 'gi'))) {
    const c = normCur(m[1]); if (c) curCounts[c] = (curCounts[c] || 0) + 1;
  }
  let currency = 'RON';
  let best = -1;
  for (const [c, n] of Object.entries(curCounts)) { if (n > best) { best = n; currency = c; } }

  // --- Total: largest amount near a "total / amount due" label. The value may sit
  //     on the same line OR the next one (column layouts), so we allow one newline.
  //     We take the largest such tagged amount (the grand total incl. VAT). ---
  let totalCents = 0;
  const totalLabel = /(total\s+de\s+plat[ăa]|total\s+general|total\s+factur[ăa]|sum[ăa]\s+de\s+plat[ăa]|rest\s+de\s+plat[ăa]|grand\s+total|amount\s+due|balance\s+due|total\s+to\s+pay|total)/gi;
  for (const m of text.matchAll(totalLabel)) {
    const window = text.slice(m.index! + m[0].length, m.index! + m[0].length + 60);
    const am = window.match(new RegExp(`(${AMT})`));
    if (am) { const c = toCents(am[1]); if (c > totalCents) totalCents = c; }
  }
  // Fallback: any amount carrying a currency token, take the largest.
  if (totalCents === 0) {
    const re = new RegExp(`(${AMT})\\s*${CUR_RE.source}|${CUR_RE.source}\\s*(${AMT})`, 'gi');
    for (const m of text.matchAll(re)) {
      const c = toCents(m[1] || m[m.length - 1] || ''); if (c > totalCents) totalCents = c;
    }
  }

  // The label and its value often sit on different lines (column layouts), so we
  // scan the matching line plus the next two non-empty lines for the amount.
  const lines = text.split('\n').map((l) => l.trim());
  const netLabel = /total\s+f[ăa]r[ăa]\s+TVA|valoare\s+f[ăa]r[ăa]\s+TVA|baz[ăa]\s+impozabil[ăa]|sub-?total|net\s+amount|total\s+net|f[ăa]r[ăa]\s+TVA|without\s+VAT|excl/i;
  const amountForLabel = (labelRe: RegExp, opts: { skipPercent?: boolean; exclude?: RegExp } = {}): number => {
    for (let i = 0; i < lines.length; i++) {
      const lm = labelRe.exec(lines[i]);
      if (!lm) continue;
      if (opts.exclude && opts.exclude.test(lines[i])) continue;
      // scan from just after the label (same line), then the next two lines.
      const segs = [lines[i].slice(lm.index + lm[0].length), lines[i + 1] || '', lines[i + 2] || ''];
      for (const seg of segs) {
        const re = new RegExp(`(${AMT})(\\s*%)?`, 'g');
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(seg))) {
          if (opts.skipPercent && mm[2]) continue; // a rate like "19%", not the amount
          const c = toCents(mm[1]);
          if (c > 0) return c;
        }
      }
    }
    return 0;
  };

  // --- VAT (TVA) amount — skip "fără TVA / without VAT" lines and the rate. ---
  let vatCents = amountForLabel(/T\.?V\.?A\.?|\bVAT\b|\btax\b/i, { skipPercent: true, exclude: netLabel });

  // --- Net (base): explicit subtotal / baza impozabilă, else derived below. ---
  let netCents = amountForLabel(netLabel);

  // Reconcile the three amounts (total = net + vat) from whichever two we have.
  if (totalCents > 0 && vatCents > 0 && vatCents < totalCents && netCents === 0) netCents = totalCents - vatCents;
  else if (totalCents > 0 && netCents > 0 && netCents < totalCents && vatCents === 0) vatCents = totalCents - netCents;
  else if (totalCents === 0 && netCents > 0 && vatCents > 0) totalCents = netCents + vatCents;

  // --- Issue date: first dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy. ---
  let issueDate: string | null = null;
  const dm = text.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);
  if (dm) {
    const d = dm[1].padStart(2, '0'), mo = dm[2].padStart(2, '0'), y = dm[3];
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) issueDate = `${y}-${mo}-${d}`;
  }

  // --- Document number: "factura ... nr. X" / "seria X nr Y". ---
  let documentNumber: string | null = null;
  const num = text.match(/(?:factur[ăa]|serie|seria|nr\.?\s*factur[ăa])[^\n]{0,30}?nr\.?\s*([A-Za-z0-9\-\/]{1,24})/i)
    || text.match(/\bnr\.?\s*([A-Za-z0-9\-\/]{2,24})/i);
  if (num) documentNumber = num[1];

  // --- Supplier name: from ANAF (free) when we have a RO CUI; otherwise fall back
  //     to the first prominent company-looking line (foreign suppliers). ---
  let supplierName: string | null = null;
  if (supplierCui) {
    try {
      const a = await lookupAnaf(supplierCui);
      if ((a as any)?.ok) supplierName = (a as any).name || null;
    } catch { /* offline / rate-limited — leave the name for the user to fill */ }
  }
  if (!supplierName) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const legal = /\b(S\.?R\.?L\.?|S\.?A\.?|S\.?R\.?L\.?-D|PFA|GmbH|Ltd\.?|LLC|Inc\.?|B\.?V\.?|S\.?p\.?A\.?|GmbH|OÜ|Kft|S\.?L\.?)\b/i;
    const cand = lines.slice(0, 18).find((l) => legal.test(l) && l.length <= 80 && !/factur|invoice/i.test(l));
    if (cand) supplierName = cand.replace(/\s{2,}/g, ' ').trim();
  }

  // Nothing useful parsed → let the caller decide (manual / AI fallback).
  if (totalCents <= 0 && !supplierCui && !supplierName) return { ok: false, error: 'pdf-unparsed' };

  return {
    ok: true,
    fields: { supplierName, supplierCui: supplierCui ? `RO${supplierCui}` : null, documentNumber, issueDate, currency, netCents, vatCents, totalCents, category: null, lineCount: 0 },
  };
}
