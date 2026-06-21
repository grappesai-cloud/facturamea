import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { sniffFileKind, isImageKind, validateImageDimensions } from '../../../lib/file-sniff';
import { rateLimitAsync, getClientIp } from '../../../lib/security';
import { logAction } from '../../../lib/audit';
import { putObject, storageConfigured } from '../../../lib/storage';

// Unified, hardened file upload endpoint.
//
// Use this from the frontend to upload ANY user-supplied file (POD,
// company document, message attachment, incident evidence, classified
// image, etc.). It validates magic bytes, size, image dimensions, then
// stores the file in Vercel Blob and returns the URL. The caller can
// then POST that URL to the relevant resource endpoint.
//
// POST multipart/form-data:
//   file=<binary>
//   purpose=<image|document|attachment>  // shapes the per-purpose limits
//
// Returns { url, mimeType, sizeBytes, kind, width?, height? }

interface PurposeRules {
  maxBytes: number;
  acceptedKinds: Set<string>;
  enforceImageDimensions: boolean;
}

const PURPOSES: Record<string, PurposeRules> = {
  // POD / driver photos / general images posted in chat
  image: {
    maxBytes: 10 * 1024 * 1024,
    acceptedKinds: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    enforceImageDimensions: true,
  },
  // Company documents (CMR insurance, transport licence, etc.) — usually PDF
  document: {
    maxBytes: 20 * 1024 * 1024,
    acceptedKinds: new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
    enforceImageDimensions: true,
  },
  // Generic attachment (forum, message, incident reply, classifieds image)
  attachment: {
    maxBytes: 15 * 1024 * 1024,
    acceptedKinds: new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']),
    enforceImageDimensions: true,
  },
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }

  // Per-user rate limit — 60 uploads / 5 min
  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`upload:${locals.user.id}:${ip}`, 60, 5 * 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({
      error: `Prea multe upload-uri. Aşteaptă ${Math.ceil(rl.resetIn / 60_000)} minute.`,
    }), { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return new Response(JSON.stringify({ error: 'multipart/form-data invalid' }), { status: 400 });

  const file = form.get('file') as File | null;
  const purposeKey = String(form.get('purpose') || 'attachment');
  const rules = PURPOSES[purposeKey] || PURPOSES.attachment;

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Fişier lipsă' }), { status: 400 });
  }
  if (file.size > rules.maxBytes) {
    return new Response(JSON.stringify({
      error: `Fişier prea mare (${(file.size/1024/1024).toFixed(1)} MB) — maxim ${rules.maxBytes/1024/1024} MB pentru "${purposeKey}".`,
    }), { status: 400 });
  }

  // Validate the actual content, not the client-supplied MIME
  const kind = await sniffFileKind(file);
  if (!kind || !rules.acceptedKinds.has(kind)) {
    const accepted = Array.from(rules.acceptedKinds).join(', ');
    return new Response(JSON.stringify({
      error: `Tip fişier respins. Accept doar: ${accepted}`,
    }), { status: 400 });
  }

  // Image-specific dimension cap (skipped for PDF / tachograph)
  let width: number | undefined;
  let height: number | undefined;
  if (rules.enforceImageDimensions && isImageKind(kind)) {
    const dims = await validateImageDimensions(file);
    if (!dims.ok) {
      return new Response(JSON.stringify({ error: dims.reason }), { status: 400 });
    }
    width = dims.width;
    height = dims.height;
  }

  // Store privately (S3-compatible: R2/MinIO/S3, or Vercel Blob fallback) if
  // configured. We return a stable proxy URL (/api/files?p=<key>) — never a raw
  // public URL — so the authenticated, same-company proxy gates every read.
  // Without any backend, return a clear pending:// URL so the caller knows
  // storage isn't wired.
  let url: string;
  try {
    if (storageConfigured()) {
      // Key: <companyId>/<purpose>/<nanoid>-<sanitized-filename>
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      const folder = locals.user.companyId ?? 'orphan';
      const pathname = `${folder}/${purposeKey}/${nanoid(10)}-${safeName}`;
      const buf = Buffer.from(await file.arrayBuffer());
      await putObject(pathname, buf, kind);
      url = `/api/files?p=${encodeURIComponent(pathname)}`;
    } else {
      url = `pending://storage-not-configured/${file.name}`;
    }
  } catch (err) {
    console.error('file upload failed', err);
    return new Response(JSON.stringify({ error: 'Eroare upload' }), { status: 500 });
  }

  await logAction({
    userId: locals.user.id, companyId: locals.user.companyId,
    action: 'file.uploaded',
    metadata: { purpose: purposeKey, kind, sizeBytes: file.size, width, height },
    request,
  });

  return new Response(JSON.stringify({
    url,
    mimeType: kind,
    sizeBytes: file.size,
    kind,
    width,
    height,
  }), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
