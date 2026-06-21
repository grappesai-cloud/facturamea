// Provider-agnostic private object storage.
//
// Prefers S3-compatible storage (Cloudflare R2 / self-hosted MinIO / AWS S3)
// when S3_* env is set; falls back to Vercel Blob when its token is present.
// Either way the model is the same: files are PRIVATE and callers persist a
// stable proxy URL (`/api/files?p=<key>`) that streams bytes only to an
// authenticated, same-company user (see src/pages/api/files.ts).
//
// Env (S3-compatible — recommended, no monthly fee, no lock-in):
//   S3_ENDPOINT          e.g. https://<accountid>.r2.cloudflarestorage.com  (R2)
//                        or   http://minio:9000                              (MinIO)
//   S3_BUCKET            bucket name
//   S3_ACCESS_KEY_ID     access key
//   S3_SECRET_ACCESS_KEY secret key
//   S3_REGION            optional, default 'auto' (R2). For AWS use the real region.
//   S3_FORCE_PATH_STYLE  optional, default 'true' (required by MinIO; harmless for R2)

const env = (k: string): string | undefined =>
  ((import.meta as any).env?.[k] as string | undefined) ?? process.env[k];

function s3Configured(): boolean {
  return !!(env('S3_BUCKET') && env('S3_ACCESS_KEY_ID') && env('S3_SECRET_ACCESS_KEY') && env('S3_ENDPOINT'));
}

/** True when SOME storage backend is wired (S3-compatible or Vercel Blob). */
export function storageConfigured(): boolean {
  return s3Configured() || !!env('BLOB_READ_WRITE_TOKEN');
}

type GetResult = { body: Uint8Array; contentType: string; size: number } | null;

let _s3client: any = null;
async function s3client() {
  if (_s3client) return _s3client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _s3client = new S3Client({
    region: env('S3_REGION') || 'auto',
    endpoint: env('S3_ENDPOINT'),
    // MinIO requires path-style addressing; R2/S3 tolerate it.
    forcePathStyle: (env('S3_FORCE_PATH_STYLE') ?? 'true') !== 'false',
    credentials: {
      accessKeyId: env('S3_ACCESS_KEY_ID') as string,
      secretAccessKey: env('S3_SECRET_ACCESS_KEY') as string,
    },
  });
  return _s3client;
}

/** Store a private object under `key`. Throws 'storage-not-configured' if no backend. */
export async function putObject(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void> {
  if (s3Configured()) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const c = await s3client();
    await c.send(new PutObjectCommand({ Bucket: env('S3_BUCKET'), Key: key, Body: data, ContentType: contentType }));
    return;
  }
  if (env('BLOB_READ_WRITE_TOKEN')) {
    const { put } = await import('@vercel/blob');
    await put(key, data as unknown as Buffer, { access: 'public', addRandomSuffix: false, contentType } as any);
    return;
  }
  throw new Error('storage-not-configured');
}

/** Fetch a private object's bytes, or null if missing / no backend. */
export async function getObject(key: string): Promise<GetResult> {
  if (s3Configured()) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const c = await s3client();
    try {
      const r = await c.send(new GetObjectCommand({ Bucket: env('S3_BUCKET'), Key: key }));
      const body: Uint8Array = await r.Body.transformToByteArray();
      return { body, contentType: r.ContentType || 'application/octet-stream', size: r.ContentLength ?? body.length };
    } catch (e: any) {
      if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
  if (env('BLOB_READ_WRITE_TOKEN')) {
    const { head } = await import('@vercel/blob');
    try {
      const meta = await head(key);
      if (!meta?.url) return null;
      const ab = await (await fetch(meta.url)).arrayBuffer();
      return { body: new Uint8Array(ab), contentType: meta.contentType || 'application/octet-stream', size: meta.size ?? ab.byteLength };
    } catch {
      return null;
    }
  }
  return null;
}
