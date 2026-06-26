// Native push: APNs (iOS) + FCM v1 (Android). No heavy SDKs — JWTs are signed
// with node:crypto, APNs uses HTTP/2 (required by Apple), FCM uses HTTP/1 fetch.
//
// Config (Coolify env):
//   iOS  — APNS_KEY_ID, APNS_TEAM_ID, APNS_P8 (the .p8 PEM, \n-escaped ok),
//          APNS_BUNDLE_ID (default com.facturamea.app), APNS_PRODUCTION=true|false
//   Andr — FCM_SERVICE_ACCOUNT (the Firebase service-account JSON, as a string)
import http2 from 'node:http2';
import crypto from 'node:crypto';
import { db } from '../db';
import { deviceTokens } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const b64url = (b: Buffer | string) => Buffer.from(b as any).toString('base64url');

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}

// ── APNs ──────────────────────────────────────────────────────────────────
let apnsCache: { jwt: string; iat: number } | null = null;
function apnsJwt(): string | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const p8 = process.env.APNS_P8;
  if (!keyId || !teamId || !p8) return null;
  const now = Math.floor(Date.now() / 1000);
  if (apnsCache && now - apnsCache.iat < 3000) return apnsCache.jwt; // APNs tokens valid ~1h, refresh well before
  const key = p8.replace(/\\n/g, '\n');
  const signingInput = `${b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${b64url(JSON.stringify({ iss: teamId, iat: now }))}`;
  const signer = crypto.createSign('SHA256');
  signer.update(signingInput);
  // ES256 needs the raw R||S (P1363) encoding, not DER.
  const sig = signer.sign({ key, dsaEncoding: 'ieee-p1363' });
  const jwt = `${signingInput}.${b64url(sig)}`;
  apnsCache = { jwt, iat: now };
  return jwt;
}

export function isApnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_P8);
}

async function sendApns(token: string, p: PushPayload): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  const jwt = apnsJwt();
  if (!jwt) return { ok: false, error: 'apns_not_configured' };
  const bundle = process.env.APNS_BUNDLE_ID || 'com.facturamea.app';
  const host = process.env.APNS_PRODUCTION === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const body = JSON.stringify({
    aps: { alert: { title: p.title, body: p.body }, sound: 'default', badge: p.badge ?? 1 },
    ...(p.data || {}),
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { ok: boolean; error?: string; gone?: boolean }) => { if (!done) { done = true; resolve(r); } };
    let client: http2.ClientHttp2Session;
    try { client = http2.connect(host); } catch (e) { return finish({ ok: false, error: String(e) }); }
    client.on('error', (e) => finish({ ok: false, error: String(e) }));
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`, 'apns-topic': bundle, 'apns-push-type': 'alert', 'content-type': 'application/json',
    });
    let status = 0; let data = '';
    req.on('response', (h) => { status = Number(h[':status']) || 0; });
    req.on('data', (d) => { data += d; });
    req.on('end', () => {
      client.close();
      if (status === 200) finish({ ok: true });
      else finish({ ok: false, error: `apns_${status}: ${data.slice(0, 160)}`, gone: status === 410 || /BadDeviceToken|Unregistered/.test(data) });
    });
    req.on('error', (e) => { try { client.close(); } catch {} finish({ ok: false, error: String(e) }); });
    req.setTimeout(8000, () => { try { client.close(); } catch {} finish({ ok: false, error: 'apns_timeout' }); });
    req.end(body);
  });
}

// ── FCM (HTTP v1) ────────────────────────────────────────────────────────
let fcmCache: { token: string; exp: number } | null = null;
async function fcmAccessToken(sa: any): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmCache && fcmCache.exp - now > 60) return fcmCache.token;
  const signingInput = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const jwt = `${signingInput}.${b64url(signer.sign(sa.private_key.replace(/\\n/g, '\n')))}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j?.access_token) return null;
  fcmCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

export function isFcmConfigured(): boolean {
  return !!process.env.FCM_SERVICE_ACCOUNT;
}

async function sendFcm(token: string, p: PushPayload): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return { ok: false, error: 'fcm_not_configured' };
  let sa: any;
  try { sa = JSON.parse(raw); } catch { return { ok: false, error: 'fcm_bad_service_account' }; }
  const at = await fcmAccessToken(sa);
  if (!at) return { ok: false, error: 'fcm_auth_failed' };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title: p.title, body: p.body }, data: p.data || {} } }),
  });
  if (res.ok) return { ok: true };
  const t = await res.text().catch(() => '');
  return { ok: false, error: `fcm_${res.status}: ${t.slice(0, 160)}`, gone: /UNREGISTERED|InvalidRegistration|NotRegistered/.test(t) };
}

// ── Public: send to all of a user's devices ────────────────────────────────
export async function sendNativePushToUser(userId: string, p: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!isApnsConfigured() && !isFcmConfigured()) return { sent: 0, failed: 0 };
  let rows: { id: string; platform: string; token: string }[] = [];
  try {
    rows = await db.select({ id: deviceTokens.id, platform: deviceTokens.platform, token: deviceTokens.token })
      .from(deviceTokens).where(eq(deviceTokens.userId, userId));
  } catch { return { sent: 0, failed: 0 }; }

  let sent = 0; let failed = 0;
  for (const r of rows) {
    const res = r.platform === 'ios' ? await sendApns(r.token, p) : await sendFcm(r.token, p);
    if (res.ok) sent++;
    else {
      failed++;
      // Prune tokens APNs/FCM say are dead so we stop hammering them.
      if (res.gone) { try { await db.delete(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, r.token))); } catch {} }
    }
  }
  return { sent, failed };
}
