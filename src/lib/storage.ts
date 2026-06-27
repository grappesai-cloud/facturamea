// Private object storage on S3-compatible backends (Cloudflare R2 /
// self-hosted MinIO / AWS S3). Files are PRIVATE and callers persist a stable
// proxy URL (`/api/files?p=<key>`) that streams bytes only to an authenticated,
// same-company user (see src/pages/api/files.ts).
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

/** True when the S3-compatible storage backend is wired. */
export function storageConfigured(): boolean {
  return s3Configured();
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
  if (!s3Configured()) throw new Error('storage-not-configured');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const c = await s3client();
  await c.send(new PutObjectCommand({ Bucket: env('S3_BUCKET'), Key: key, Body: data, ContentType: contentType }));
}

/** Fetch a private object's bytes, or null if missing / no backend. */
export async function getObject(key: string): Promise<GetResult> {
  if (!s3Configured()) return null;
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
