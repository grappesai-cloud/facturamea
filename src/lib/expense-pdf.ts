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

// Parse invoice fields from already-extracted text — shared by the PDF text-layer
// reader and the Tesseract image OCR.
export async function parseExpenseText(text: string, ownCui?: string | null): Promise<PdfExpenseResult> {
  const own = (ownCui || '').replace(/^RO/i, '').replace(/\D/g, '');

  // --- Supplier CUI: validated CUIs in the text, excluding the buyer (our own). ---
  const candidates = [...text.matchAll(/\b(?:RO\s?)?(\d{2,10})\b/gi)]
    .map((m) => m[1]).filter((c) => isValidCui(c));
  const uniq = Array.from(new Set(candidates));
  const supplierCui = uniq.find((c) => c !== own) || uniq[0] || null;

  // --- Total: the largest amount tagged as a "total". ---
  let totalCents = 0;
  const totalRe = /total[^\n]{0,40}?([\d][\d.,]*\d)/gi;
  for (const m of text.matchAll(totalRe)) {
    const c = toCents(m[1]);
    if (c > totalCents) totalCents = c;
  }
  // Fallback: any "X RON/LEI" amount, take the largest.
  if (totalCents === 0) {
    for (const m of text.matchAll(/([\d][\d.,]*\d)\s*(?:RON|LEI)\b/gi)) {
      const c = toCents(m[1]); if (c > totalCents) totalCents = c;
    }
  }

  // --- VAT (TVA) amount, if explicitly stated. Require a RON/LEI suffix OR a
  //     decimal so we don't grab the rate ("TVA 19%") as the amount. ---
  let vatCents = 0;
  const vatM = text.match(/T\.?V\.?A\.?[^\n]{0,30}?([\d][\d.,]*\d)\s*(?:RON|LEI)\b/i)
    || text.match(/T\.?V\.?A\.?[^\n]{0,20}?(?:%|cot[ăa])[^\n]{0,12}?([\d][\d.,]*[.,]\d{2})\b/i);
  if (vatM) vatCents = toCents(vatM[1]);
  const netCents = totalCents > 0 && vatCents > 0 && vatCents < totalCents ? totalCents - vatCents : 0;

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

  // --- Supplier name from ANAF (free) when we have a CUI. ---
  let supplierName: string | null = null;
  if (supplierCui) {
    try {
      const a = await lookupAnaf(supplierCui);
      if ((a as any)?.ok) supplierName = (a as any).name || null;
    } catch { /* offline / rate-limited — leave the name for the user to fill */ }
  }

  // Nothing useful parsed → let the caller decide (manual / AI fallback).
  if (totalCents <= 0 && !supplierCui) return { ok: false, error: 'pdf-unparsed' };

  return {
    ok: true,
    fields: { supplierName, supplierCui: supplierCui ? `RO${supplierCui}` : null, documentNumber, issueDate, netCents, vatCents, totalCents, category: null, lineCount: 0 },
  };
}
