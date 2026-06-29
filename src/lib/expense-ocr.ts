// Expense OCR — extract structured fields from a photo/PDF of a receipt or
// supplier invoice using Claude vision (Haiku 4.5, vision-capable + cheap).
//
// Design notes:
//   - Money is returned as INTEGER cents, matching the rest of facturamea.
//   - The model is asked for STRICT JSON; we parse defensively (strip fences,
//     coerce types) and never throw on a bad image — callers get { ok:false }.
//   - If only a total is legible, we set totalCents and leave net/vat at 0.
//   - The system prompt is heavy and reused, so it carries cache_control.

const OCR_MODEL = 'claude-haiku-4-5-20251001';

export interface OcrFields {
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

export type OcrResult =
  | { ok: true; fields: OcrFields }
  | { ok: false; error: string };

const VALID_CATEGORIES = ['utilitati', 'chirie', 'combustibil', 'servicii', 'marfa', 'salarii', 'taxe', 'altele'];

// Media types Claude vision accepts for images. PDFs go via the document block.
const IMAGE_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function toCents(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  // The model is instructed to return integer cents already; round to be safe.
  return Math.round(n);
}

function normalizeFields(raw: any): OcrFields {
  const cat = typeof raw?.category === 'string' ? raw.category.trim().toLowerCase() : '';
  let issueDate: string | null = null;
  if (typeof raw?.issueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.issueDate.trim())) {
    issueDate = raw.issueDate.trim();
  }
  let netCents = toCents(raw?.netCents);
  let vatCents = toCents(raw?.vatCents);
  let totalCents = toCents(raw?.totalCents);
  // If only total is present, leave net/vat 0 (per spec). If total missing but
  // net+vat present, derive total so the form is still usable.
  if (totalCents === 0 && (netCents > 0 || vatCents > 0)) totalCents = netCents + vatCents;

  return {
    supplierName: typeof raw?.supplierName === 'string' && raw.supplierName.trim() ? raw.supplierName.trim().slice(0, 200) : null,
    supplierCui: typeof raw?.supplierCui === 'string' && raw.supplierCui.trim() ? raw.supplierCui.trim().slice(0, 32) : null,
    documentNumber: typeof raw?.documentNumber === 'string' && raw.documentNumber.trim() ? raw.documentNumber.trim().slice(0, 64) : null,
    issueDate,
    netCents,
    vatCents,
    totalCents,
    currency: typeof raw?.currency === 'string' && raw.currency.trim() ? raw.currency.trim().toUpperCase().slice(0, 5) : 'RON',
    category: VALID_CATEGORIES.includes(cat) ? cat : null,
  };
}

const SYSTEM_PROMPT = [
  'Ești un asistent OCR pentru contabilitate. Primești o poză sau un PDF al unui bon fiscal sau al unei facturi de la furnizor (în limba română) și extragi datele.',
  'Răspunzi DOAR cu JSON valid, fără text în plus, fără explicații, fără markdown. Schema exactă:',
  '{',
  '  "supplierName": string|null,   // numele furnizorului/comerciantului',
  '  "supplierCui": string|null,    // CUI / CIF (ex: "RO12345678" sau "12345678")',
  '  "documentNumber": string|null, // numărul documentului/bonului/facturii',
  '  "issueDate": string|null,      // data emiterii în format YYYY-MM-DD',
  '  "netCents": integer,           // baza fără TVA, în bani (cenți). 12,50 RON => 1250',
  '  "vatCents": integer,           // valoarea TVA, în bani (cenți)',
  '  "totalCents": integer,         // total de plată, în bani (cenți)',
  '  "currency": string,            // codul valutei, ex "RON", "EUR"',
  '  "category": string|null        // una din: utilitati, chirie, combustibil, servicii, marfa, salarii, taxe, altele',
  '}',
  'Reguli stricte:',
  '- TOATE sumele sunt numere ÎNTREGI de bani (cenți). Înmulțește cu 100 valoarea în lei. Nu folosi zecimale.',
  '- Dacă vezi doar totalul, pune-l în totalCents și lasă netCents și vatCents pe 0.',
  '- Dacă un câmp nu e lizibil sau nu apare, pune null (pentru text) sau 0 (pentru sume).',
  '- Nu inventa date. Folosește doar ce e clar vizibil pe document.',
  '- Pentru category, alege cea mai potrivită din listă; dacă nu ești sigur, pune null.',
  '- Răspunde DOAR cu obiectul JSON.',
].join('\n');

/**
 * Run OCR on a receipt/invoice file. Never throws — returns { ok:false, error }
 * on any failure (no API key, bad image, model refusal, network, parse error).
 */
export async function ocrExpense(bytes: Uint8Array, mediaType: string): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'OCR indisponibil: cheia ANTHROPIC_API_KEY nu este configurată.' };

  let mt = (mediaType || '').toLowerCase();
  let imgBytes = bytes;

  // iPhone photos are HEIC/HEIF, which Claude vision can't read — convert to JPEG.
  const brand = bytes.length > 12 ? String.fromCharCode(...bytes.slice(4, 12)) : '';
  const isHeic = mt === 'image/heic' || mt === 'image/heif'
    || (brand.startsWith('ftyp') && /heic|heix|mif1|heim|hevc|msf1/.test(brand));
  if (isHeic) {
    try {
      const { default: heicConvert } = await import('heic-convert');
      const out = await heicConvert({ buffer: Buffer.from(bytes) as any, format: 'JPEG', quality: 0.9 });
      imgBytes = new Uint8Array(out);
      mt = 'image/jpeg';
    } catch {
      return { ok: false, error: 'Nu am putut converti poza HEIC. Salveaz-o ca JPG sau fă o captură de ecran.' };
    }
  }

  const isPdf = mt === 'application/pdf';
  const isImage = IMAGE_MEDIA.has(mt);
  if (!isPdf && !isImage) {
    return { ok: false, error: 'Tip de fișier neacceptat. Încarcă o imagine (JPG/PNG/WebP/HEIC) sau un PDF.' };
  }

  let base64: string;
  try {
    base64 = Buffer.from(imgBytes).toString('base64');
  } catch {
    return { ok: false, error: 'Nu am putut citi fișierul.' };
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const fileBlock: any = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mt, data: base64 } };

    const resp = await client.messages.create({
      model: OCR_MODEL,
      max_tokens: 500,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: 'Extrage datele din acest document și returnează DOAR obiectul JSON conform schemei.' },
          ],
        },
      ],
    });

    if ((resp as any).stop_reason === 'refusal') {
      return { ok: false, error: 'Documentul nu a putut fi procesat.' };
    }

    const textBlock = resp.content.find((b: any) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const text = textBlock?.text || '';
    const stripped = text.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
    // Be lenient: grab the first {...} block if there's surrounding prose.
    const match = stripped.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : stripped;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return { ok: false, error: 'Nu am reușit să interpretez datele din document. Completează manual.' };
    }
    const fields = normalizeFields(parsed);
    if (fields.totalCents <= 0 && fields.netCents <= 0) {
      return { ok: false, error: 'Nu am găsit o sumă pe document. Completează manual.' };
    }
    return { ok: true, fields };
  } catch (err: any) {
    console.error('[ocr] error', err?.status, err?.message || err);
    return { ok: false, error: 'Eroare la procesarea documentului. Încearcă din nou sau completează manual.', _debug: String(err?.message || err).slice(0, 240) } as any;
  }
}
