// Non-AI OCR for photos / scanned receipts via Tesseract (open-source, free).
// Recognizes the text (Romanian + English) then reuses the same heuristic parser
// as the PDF text layer (supplier CUI → free ANAF lookup, total/VAT/date/number).
// Slower + less accurate than Claude vision, but no AI, no per-document cost.
import { parseExpenseText, type PdfExpenseResult } from './expense-pdf';

export async function ocrImageExpense(bytes: Uint8Array, ownCui?: string | null): Promise<PdfExpenseResult> {
  let worker: any = null;
  let text = '';
  try {
    const { createWorker } = await import('tesseract.js');
    // 'ron+eng' — Romanian invoices, with English as a fallback. Language data is
    // fetched + cached by tesseract.js on first use.
    worker = await createWorker('ron+eng');
    const { data } = await worker.recognize(Buffer.from(bytes));
    text = data?.text || '';
  } catch {
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }
    return { ok: false, error: 'image-ocr-failed' };
  }
  if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }

  if (!text || text.replace(/\s+/g, '').length < 15) return { ok: false, error: 'image-ocr-empty' };
  return parseExpenseText(text, ownCui);
}
