import crypto from 'node:crypto';

// Shared cron authorization for /api/cron/* routes (middleware exempts these
// from session auth, so this Bearer check is the ONLY gate).
//
// Fail-CLOSED in production: if CRON_SECRET is not configured we reject, so a
// missing/typo'd env var can never world-open a deployed cron. In dev/test
// (no prod build) we allow when the secret is absent so local runs work.
// Comparison is constant-time to avoid leaking the secret via timing.
export function isCronAuthorized(request: Request): boolean {
  const expected = import.meta.env.CRON_SECRET || process.env.CRON_SECRET;
  const isProd = import.meta.env.PROD || process.env.NODE_ENV === 'production';
  if (!expected) return !isProd;

  const provided = request.headers.get('authorization') || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
