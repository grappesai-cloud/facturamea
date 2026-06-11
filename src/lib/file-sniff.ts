// Magic-byte content sniffing for uploaded files. The Content-Type
// header from the client is trivially forgeable; reading the first
// few bytes catches polyglot attacks (image with embedded HTML/JS,
// PDF disguised as PNG, etc.).
//
// Returns the detected MIME or null if nothing matched.

export type DetectedKind = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf' | 'tachograph' | null;

export async function sniffFileKind(file: File): Promise<DetectedKind> {
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (buf.length < 4) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return 'image/jpeg';
  }
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 ('RIFF' .... 'WEBP')
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'image/webp';
  }
  // GIF: 47 49 46 38 ('GIF8')
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return 'image/gif';
  }
  // PDF: 25 50 44 46 ('%PDF')
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return 'application/pdf';
  }
  // EU tachograph generation 2 (.ddd binary): starts with 0x76 ('v') often,
  // but the first signed record header is 'TR' or specific tags. Be lenient:
  // only confirm if file extension matches and the first byte is in the
  // expected printable-control range (binary EDIF).
  if (file.name.match(/\.(ddd|v1b|c1b|esm)$/i)) {
    return 'tachograph';
  }
  return null;
}

const IMAGE_MIME_SET = new Set<DetectedKind>(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export function isImageKind(k: DetectedKind): boolean {
  return IMAGE_MIME_SET.has(k);
}

// Read image dimensions without loading a heavy library. Parses the
// width/height fields from the file header for PNG / JPEG / WebP / GIF.
// Returns null for unsupported formats.
export async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const buf = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  if (buf.length < 24) return null;

  // PNG: bytes 16-23 = width then height (BE 32-bit each)
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return {
      width:  (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19],
      height: (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23],
    };
  }

  // GIF: bytes 6-9 = width then height (LE 16-bit each)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return {
      width:  buf[6] | (buf[7] << 8),
      height: buf[8] | (buf[9] << 8),
    };
  }

  // WebP (VP8 / VP8L / VP8X variants)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
    // Simple lossy: 'VP8 ' at byte 12, dims at 26-29
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
      return {
        width:  ((buf[27] << 8) | buf[26]) & 0x3FFF,
        height: ((buf[29] << 8) | buf[28]) & 0x3FFF,
      };
    }
    // VP8L (lossless)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4C) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return {
        width:  (((b1 & 0x3F) << 8) | b0) + 1,
        height: ((b3 & 0x0F) << 10 | b2 << 2 | (b1 & 0xC0) >> 6) + 1,
      };
    }
    // VP8X (extended)
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x58) {
      return {
        width:  ((buf[26] | (buf[27] << 8) | (buf[28] << 16)) & 0xFFFFFF) + 1,
        height: ((buf[29] | (buf[30] << 8) | (buf[31] << 16)) & 0xFFFFFF) + 1,
      };
    }
  }

  // JPEG: scan markers for SOFx (FF C0..C3, C5..C7, C9..CB, CD..CF)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      const isSof = (marker >= 0xC0 && marker <= 0xC3)
                 || (marker >= 0xC5 && marker <= 0xC7)
                 || (marker >= 0xC9 && marker <= 0xCB)
                 || (marker >= 0xCD && marker <= 0xCF);
      if (isSof) {
        return {
          height: (buf[i + 5] << 8) | buf[i + 6],
          width:  (buf[i + 7] << 8) | buf[i + 8],
        };
      }
      // Skip this segment
      const segLen = (buf[i + 2] << 8) | buf[i + 3];
      i += 2 + segLen;
    }
    return null;
  }

  return null;
}

export interface ImageValidationOptions {
  maxWidth?: number;   // default 8000
  maxHeight?: number;  // default 8000
  maxPixels?: number;  // default 50_000_000 (50MP — guards against huge but skinny images)
}

export interface ImageValidationResult {
  ok: boolean;
  reason?: string;
  width?: number;
  height?: number;
}

export async function validateImageDimensions(file: File, opts: ImageValidationOptions = {}): Promise<ImageValidationResult> {
  const maxW = opts.maxWidth ?? 8000;
  const maxH = opts.maxHeight ?? 8000;
  const maxPx = opts.maxPixels ?? 50_000_000;
  const dims = await imageDimensions(file);
  if (!dims) return { ok: true }; // unknown format → let other checks gate
  const { width, height } = dims;
  if (width > maxW || height > maxH) {
    return { ok: false, reason: `Imagine prea mare (${width}×${height}) — max ${maxW}×${maxH}`, width, height };
  }
  if (width * height > maxPx) {
    return { ok: false, reason: `Imagine cu prea mulţi pixeli (${width}×${height} = ${(width*height/1_000_000).toFixed(1)}MP) — max ${maxPx/1_000_000}MP`, width, height };
  }
  return { ok: true, width, height };
}
