import { nanoid } from 'nanoid';
import { Redis } from '@upstash/redis';

// Lazy singleton: only construct the client if env is configured. Falls
// back to in-memory limiter when Upstash isn't wired (e.g. local dev).
let redisClient: Redis | null = null;
let redisChecked = false;
function getRedis(): Redis | null {
  if (redisChecked) return redisClient;
  redisChecked = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // Deployment target is a single persistent Node server (Coolify), so the
    // in-memory limiter IS shared across requests on that instance and remains
    // viable — we don't hard-crash. But Upstash is still preferred (survives
    // restarts, scales horizontally), so warn loudly when it's missing in prod.
    if (import.meta.env.PROD || process.env.NODE_ENV === 'production') {
      console.warn('[security] Upstash Redis is NOT configured in production — rate limiting & login lockout fall back to in-memory (per-instance, reset on restart). Acceptable for a single Node instance, but set UPSTASH_REDIS_REST_URL/TOKEN to harden.');
    }
    return null;
  }
  try {
    redisClient = new Redis({ url, token });
  } catch (err) {
    console.error('[upstash] init failed, falling back to in-memory:', err);
    redisClient = null;
  }
  return redisClient;
}

// ─── CSRF Protection ──────────────────────────────────────
//
// Primary defence is the Origin/Referer check inside src/middleware.ts on every
// mutating /api/* request, plus the session cookie's SameSite=Lax attribute.
// The double-submit token helpers below are reserved for future high-risk
// endpoints (e.g. password change) where defence-in-depth is wanted.
// To use: call generateCsrfToken() server-side, send the cookie with
// setCsrfCookie() AND surface the token in a non-HttpOnly client-readable
// channel (e.g. <meta>), then have the client mirror it in the x-csrf-token
// header. Until that wiring exists, do not call validateCsrf() — it will
// always fail because the cookie is HttpOnly so JS can't read it.

const CSRF_COOKIE = 'th_csrf';

export function generateCsrfToken(): string {
  return nanoid(32);
}

export function setCsrfCookie(token: string): string {
  // Note: NOT HttpOnly so JS can read it for double-submit pattern.
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Strict; Max-Age=86400`;
}

export function validateCsrf(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = request.headers.get('x-csrf-token');

  if (!cookieToken || !headerToken) return false;
  return cookieToken === headerToken;
}

// ─── Rate Limiting ────────────────────────────────────────
//
// Primary path: Upstash Redis (works cross-container on Vercel serverless).
// Fallback: in-memory Map (only safe in dev or single-instance setups).
// API stays synchronous-looking to keep call sites unchanged — we expose
// both `rateLimit` (sync, in-memory only) and `rateLimitAsync` (preferred,
// uses Upstash when available).

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup is best-effort — in serverless, this only fires while a
// container is warm. Acceptable since entries also expire on read.
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt < now) rateLimitStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

function rateLimitInMemory(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now };
}

export function rateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000,
): { allowed: boolean; remaining: number; resetIn: number } {
  return rateLimitInMemory(key, maxRequests, windowMs);
}

// Async rate limit backed by Upstash (atomic INCR + EXPIRE). When Upstash
// isn't configured, transparently falls back to in-memory.
export async function rateLimitAsync(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedis();
  if (!redis) return rateLimitInMemory(key, maxRequests, windowMs);

  const redisKey = `rl:${key}`;
  try {
    const ttlSec = Math.ceil(windowMs / 1000);
    // INCR + first-call EXPIRE: race-safe since INCR returns 1 only on
    // creation; only then do we set TTL.
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, ttlSec);
    const ttl = await redis.ttl(redisKey);
    const resetIn = ttl > 0 ? ttl * 1000 : windowMs;
    if (count > maxRequests) return { allowed: false, remaining: 0, resetIn };
    return { allowed: true, remaining: maxRequests - count, resetIn };
  } catch (err) {
    console.error('[rate-limit] Upstash error, falling back to in-memory:', err);
    return rateLimitInMemory(key, maxRequests, windowMs);
  }
}

export function getClientIp(request: Request): string {
  // Trust ONLY proxy-set headers. The FIRST x-forwarded-for hop is client-supplied
  // and spoofable — an attacker rotates it to bypass IP-keyed rate-limit/lockout —
  // so we never use it. Vercel edge sets x-vercel-forwarded-for; Traefik/Coolify
  // sets x-real-ip (overwriting any client value). As a last resort use the LAST
  // x-forwarded-for hop (appended by our own reverse proxy), never the first.
  const vercel = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercel) return vercel;
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}

// Country code from Cloudflare edge (ISO-3166-1 alpha-2). Returns null
// when not behind Cloudflare or when the country couldn't be determined.
export function getClientCountry(request: Request): string | null {
  const c = request.headers.get('cf-ipcountry');
  if (!c || c === 'XX' || c === 'T1') return null; // T1 = Tor
  return c.toUpperCase();
}

// Whether this request looks like it's coming through Cloudflare's proxy.
// Useful for asserting WAF + DDoS protection are actually active.
export function isViaCloudflare(request: Request): boolean {
  return Boolean(request.headers.get('cf-ray'));
}

// Validates that an attachment / document URL submitted by a user
// actually points to one of the allowlisted storage backends. Stops
// users from injecting arbitrary URLs (data exfiltration, SSRF surface
// in admin views, phishing in shared docs).
export function isAllowedStorageUrl(url: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  // Our own authenticated proxy for private Blob files. Uploads return a
  // relative URL of this exact form; the pathname is validated on read.
  if (url.startsWith('/api/files?p=')) return true;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const allowedHostSuffixes = [
    '.public.blob.vercel-storage.com',
    '.blob.vercel-storage.com',
    'blob.vercel-storage.com',
    'facturamea.com',
    'www.facturamea.com',
  ];
  return allowedHostSuffixes.some((s) => parsed.hostname === s || parsed.hostname.endsWith(s));
}

// ─── Input Sanitization ───────────────────────────────────

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Strip null bytes + control chars from user-supplied text. Astro/React
// auto-escape handles XSS at render time, so we don't need HTML-encoding
// at storage (would double-escape). But null bytes confuse Postgres TEXT
// comparisons and control chars can hide payloads from log scanners.
// Keeps \t (0x09), \n (0x0A), \r (0x0D).
export function stripControlChars(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ─── Password Reset Token ────────────────────────────────

export function generateResetToken(): string {
  return nanoid(48);
}

export function isTokenExpired(createdAt: string, maxAgeMinutes: number = 60): boolean {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return now - created > maxAgeMinutes * 60 * 1000;
}

// ─── Account Lockout ──────────────────────────────────────
//
// Backed by Upstash when configured, in-memory otherwise. 5 failed
// attempts → 15-minute lockout. Sync API kept for backward compat but
// only checks in-memory; prefer the *Async variants in new code.

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const COUNTER_TTL_SEC = 30 * 60; // forget failures after 30 min

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

export function checkLoginLockout(email: string): { locked: boolean; minutesRemaining: number } {
  const entry = loginAttempts.get(email);
  if (!entry) return { locked: false, minutesRemaining: 0 };
  if (entry.lockedUntil > Date.now()) {
    return { locked: true, minutesRemaining: Math.ceil((entry.lockedUntil - Date.now()) / 60000) };
  }
  if (entry.lockedUntil < Date.now()) loginAttempts.delete(email);
  return { locked: false, minutesRemaining: 0 };
}

export function recordFailedLogin(email: string): void {
  const entry = loginAttempts.get(email) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= LOCKOUT_THRESHOLD) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    entry.count = 0;
  }
  loginAttempts.set(email, entry);
}

export function clearLoginAttempts(email: string): void {
  loginAttempts.delete(email);
}

export async function checkLoginLockoutAsync(email: string): Promise<{ locked: boolean; minutesRemaining: number }> {
  const redis = getRedis();
  if (!redis) return checkLoginLockout(email);
  try {
    const lockedUntil = await redis.get<number>(`lockout:${email}`);
    if (lockedUntil && lockedUntil > Date.now()) {
      return { locked: true, minutesRemaining: Math.ceil((lockedUntil - Date.now()) / 60000) };
    }
    return { locked: false, minutesRemaining: 0 };
  } catch (err) {
    console.error('[lockout] Upstash error:', err);
    return checkLoginLockout(email);
  }
}

export async function recordFailedLoginAsync(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return recordFailedLogin(email);
  try {
    const counterKey = `loginfail:${email}`;
    const count = await redis.incr(counterKey);
    if (count === 1) await redis.expire(counterKey, COUNTER_TTL_SEC);
    if (count >= LOCKOUT_THRESHOLD) {
      await redis.set(`lockout:${email}`, Date.now() + LOCKOUT_DURATION_MS, {
        ex: Math.ceil(LOCKOUT_DURATION_MS / 1000),
      });
      await redis.del(counterKey);
    }
  } catch (err) {
    console.error('[lockout] Upstash error:', err);
    return recordFailedLogin(email);
  }
}

export async function clearLoginAttemptsAsync(email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return clearLoginAttempts(email);
  try {
    await redis.del(`loginfail:${email}`, `lockout:${email}`);
  } catch (err) {
    console.error('[lockout] Upstash error:', err);
    clearLoginAttempts(email);
  }
}
