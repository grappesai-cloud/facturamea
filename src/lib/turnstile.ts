// Cloudflare Turnstile — free privacy-preserving CAPTCHA replacement.
// No tracking, no hCaptcha-style image puzzles, just a JS challenge that
// runs invisibly. Server-side verifies the token via Siteverify API.
//
// Setup:
//   1. Cloudflare dashboard → Turnstile → Add site
//   2. Get site key (public, embed in client) + secret key (server-only)
//   3. Set TURNSTILE_SECRET in Vercel env vars
//   4. Set PUBLIC_TURNSTILE_SITE_KEY in Vercel env vars
//
// When neither key is set, verifyTurnstile() returns ok:true (so dev /
// preview don't break). In production with keys set, it enforces.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  reason?: string;
  hostname?: string;
  challengeAt?: string;
}

export async function verifyTurnstile(token: string, ip?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET || process.env.CLOUDFLARE_TURNSTILE_SECRET;
  if (!secret) {
    // Anti-bot is OPT-IN: enforced only when TURNSTILE_SECRET is configured.
    // If it isn't set up, skip — blocking every login because a captcha was
    // never configured is far worse than not having one (login still has
    // rate-limiting + lockout). Set the secret to turn enforcement on.
    return { ok: true, reason: 'turnstile_not_configured' };
  }
  if (!token) {
    return { ok: false, reason: 'missing_token' };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, reason: `verify_${res.status}` };
    const data: any = await res.json();
    if (!data.success) {
      return { ok: false, reason: 'rejected_' + (data['error-codes']?.[0] || 'unknown') };
    }
    return { ok: true, hostname: data.hostname, challengeAt: data.challenge_ts };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'verify_failed' };
  }
}
