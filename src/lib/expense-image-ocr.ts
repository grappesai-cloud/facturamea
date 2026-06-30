// Non-AI OCR for photos / scanned receipts via Tesseract (open-source, free).
// Recognizes the text (Romanian + English) then reuses the same heuristic parser
// as the PDF text layer (supplier CUI → free ANAF lookup, total/VAT/date/number).
//
// Phone photos of receipts are hard for raw Tesseract (perspective, low contrast,
// thermal paper, shadows), so we PREPROCESS the image first with sharp:
// auto-orient → upscale small shots → grayscale → contrast-normalize → sharpen.
// This is the single biggest accuracy win short of AI vision.
import { parseExpenseText, type PdfExpenseResult } from './expense-pdf';

// Grayscale + contrast-stretch + upscale so the glyphs are large and high-contrast
// before Tesseract runs its own binarization. Falls back to the original bytes if
// sharp is unavailable or the image can't be decoded.
async function preprocess(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const sharp = (await import('sharp')).default;
    let img = sharp(Buffer.from(bytes), { failOn: 'none' }).rotate(); // honor EXIF orientation
    const meta = await img.metadata().catch(() => ({} as any));
    const w = Number(meta.width) || 0;
    // Receipt text must be ~20px+ tall to read well; upscale narrow shots.
    if (w > 0 && w < 1800) img = img.resize({ width: 1800 });
    const out = await img.grayscale().normalize().sharpen().toFormat('png').toBuffer();
    return new Uint8Array(out);
  } catch {
    return bytes;
  }
}

export async function ocrImageExpense(bytes: Uint8Array, ownCui?: string | null): Promise<PdfExpenseResult> {
  const prepared = await preprocess(bytes);

  let worker: any = null;
  let text = '';
  try {
    const { createWorker } = await import('tesseract.js');
    // 'ron+eng' — Romanian receipts/invoices, English as fallback. Language data is
    // fetched + cached by tesseract.js on first use.
    worker = await createWorker('ron+eng');
    // PSM 6 = treat the image as a single uniform block of text — the best fit for
    // a receipt column; keep inter-word spacing so amounts stay separate from labels.
    try { await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); } catch { /* older API */ }
    const { data } = await worker.recognize(Buffer.from(prepared));
    text = data?.text || '';
  } catch {
    if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }
    return { ok: false, error: 'image-ocr-failed' };
  }
  if (worker) { try { await worker.terminate(); } catch { /* ignore */ } }

  if (!text || text.replace(/\s+/g, '').length < 15) return { ok: false, error: 'image-ocr-empty' };
  return parseExpenseText(text, ownCui);
}
