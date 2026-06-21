import type { APIRoute } from 'astro';
import { getObject, storageConfigured } from '../../lib/storage';

// Authenticated proxy for PRIVATE Vercel Blob files.
//
// Uploads store a stable proxy URL ("/api/files?p=<pathname>") instead of the
// raw blob URL, so every <img>/<a> in the app points here. The store is
// private (blobs 403 without auth), so this route streams the bytes back only
// to a logged-in user, fetching the blob server-side with the read-write token.
//
// Access policy: blobs are stored under a `<companyId>/<purpose>/...` prefix
// (see upload/document.ts). A user may only read files under their OWN
// company's prefix; admins may read any. This prevents a leaked/forwarded
// proxy URL from being replayed cross-company.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return new Response('Neautorizat', { status: 401 });

  const pathname = url.searchParams.get('p');
  if (!pathname) return new Response('Parametru „p" lipsă', { status: 400 });

  const ownPrefix = locals.user.companyId ?? 'orphan';
  const filePrefix = pathname.split('/')[0];
  if (filePrefix !== ownPrefix && !locals.user.isAdmin) {
    return new Response('Acces interzis', { status: 403 });
  }

  if (!storageConfigured()) {
    return new Response('Stocare neconfigurată', { status: 503 });
  }

  try {
    const obj = await getObject(pathname);
    if (!obj) {
      return new Response('Fișier negăsit', { status: 404 });
    }
    const name = pathname.split('/').pop() || 'file';
    return new Response(obj.body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': obj.contentType,
        'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"`,
        'Content-Length': String(obj.size),
        // Private: browsers may cache per-user but shared caches/CDN must not.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('file proxy failed', err);
    return new Response('Eroare la servirea fișierului', { status: 500 });
  }
};
