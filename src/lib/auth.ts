import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db';
import { users, sessions, companies } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generatePlatformId } from './platform-id';

// Session tokens are stored hashed at rest: the cookie/Bearer carries the raw
// token, but sessions.id holds only its SHA-256 so a DB leak can't be replayed.
function hashSession(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Generic at-rest token hash (password-reset + team-join codes). Store the hash,
// hand the user the raw value, look up by hash on redeem — a DB leak then can't
// be replayed into a password reset or a team takeover.
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

const SESSION_COOKIE = 'th_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
// OWASP 2025 recommends ≥12 for bcrypt. Older hashes at cost 10 stay
// valid for verification; we upgrade them lazily on successful login
// via verifyAndMaybeRehash().
const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Returns the parsed cost factor of a bcrypt hash, or null if not bcrypt.
// Bcrypt hashes look like "$2b$12$..." — the 12 is the cost.
function bcryptCost(hash: string): number | null {
  const m = /^\$2[aby]\$(\d+)\$/.exec(hash);
  return m ? Number(m[1]) : null;
}

// Verify the password, then if the stored hash is below the current
// target cost, rehash transparently. Caller is responsible for fanning
// the new hash to storage (we return it).
export async function verifyAndMaybeRehash(
  password: string,
  hash: string,
): Promise<{ valid: boolean; newHash?: string }> {
  const valid = await bcrypt.compare(password, hash);
  if (!valid) return { valid: false };
  const cost = bcryptCost(hash);
  if (cost != null && cost < BCRYPT_COST) {
    try {
      const newHash = await bcrypt.hash(password, BCRYPT_COST);
      return { valid: true, newHash };
    } catch {
      // Rehash failure shouldn't block the login.
      return { valid: true };
    }
  }
  return { valid: true };
}

// Hard-revoke all sessions for a user. Use on password reset/change so
// existing logged-in devices are kicked out.
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// Delete a single session given the RAW token (from cookie/Bearer). Sessions
// are stored hashed, so the raw token must be hashed before the lookup.
export async function deleteSessionByRawToken(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await db.delete(sessions).where(eq(sessions.id, hashSession(rawToken)));
}

export async function createSession(userId: string): Promise<string> {
  // The raw token goes to the cookie/Bearer; only its hash is persisted.
  const rawToken = nanoid(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;

  await db.insert(sessions).values({
    id: hashSession(rawToken),
    userId,
    expiresAt,
  });

  return rawToken;
}

// Resolve a session by its raw token (used by both cookie and Bearer-token auth).
export async function getSessionById(sessionId: string | null | undefined) {
  if (!sessionId) return null;
  const hashed = hashSession(sessionId);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, hashed));
  if (!session) return null;
  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, hashed));
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;
  // Deactivated / soft-deleted users can never resolve a session.
  if (user.isActive === false || user.deletedAt) return null;
  return { session, user };
}

export async function getSession(cookieHeader: string | null) {
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );
  return getSessionById(cookies[SESSION_COOKIE]);
}

// Resolve a session from EITHER an `Authorization: Bearer <token>` header
// (used by the decoupled frontend) OR the session cookie. Token wins.
export async function getSessionFromRequest(request: Request) {
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m?.[1]) {
    const bySession = await getSessionById(m[1].trim());
    if (bySession) return bySession;
  }
  return getSession(request.headers.get('cookie'));
}

export function setSessionCookie(sessionId: string): string {
  const isProd = (import.meta.env.PROD ?? process.env.NODE_ENV === 'production');
  const secure = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearSessionCookie(): string {
  const isProd = (import.meta.env.PROD ?? process.env.NODE_ENV === 'production');
  const secure = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  userType: 'transportator' | 'intermediar' | 'client_direct' | 'partener';
  phone?: string;
  companyName: string;
  cui?: string;
  country: string;
  city?: string;
  companyPhone?: string;
  referralCode?: string;
}) {
  // Check if email exists
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
  if (existing) {
    throw new Error('Acest email este deja folosit');
  }

  // Resolve referral code (case-insensitive). Self-referral blocked.
  let referredByUserId: string | null = null;
  if (data.referralCode?.trim()) {
    const code = data.referralCode.trim().toUpperCase();
    // Accept the platform ID (e.g. "TH-10000") — the canonical, user-facing
    // referral code — as well as the legacy bare `referralCode` column
    // ("-10000") so links shared before the M-12 fix keep working.
    const [ref] = await db.select({ id: users.id }).from(users)
      .where(or(eq(users.platformId, code), eq(users.referralCode, code)));
    if (ref) referredByUserId = ref.id;
  }

  // Create company
  const companyId = nanoid();
  await db.insert(companies).values({
    id: companyId,
    name: data.companyName,
    cui: data.cui || null,
    country: data.country,
    city: data.city || null,
    phone: data.companyPhone || null,
    subscriptionTier: data.userType === 'transportator' ? 'free' : 'cargo',
  });

  // Create user
  const userId = nanoid();
  const platformId = await generatePlatformId();
  const hashedPassword = await hashPassword(data.password);
  // Deterministic referral code derived from platformId (uppercase, no 'TH' prefix)
  const referralCode = platformId.replace(/^TH/i, '').toUpperCase();

  await db.insert(users).values({
    id: userId,
    platformId,
    email: data.email,
    hashedPassword,
    name: data.name,
    userType: data.userType,
    companyId,
    phone: data.phone || null,
    referralCode,
    referredByUserId,
  } as any);

  // Pay referral bonus once: 100 credits to both parties.
  // Only fires when the new user came in via a real, distinct referrer.
  if (referredByUserId && referredByUserId !== userId) {
    try {
      const { addCredits } = await import('./credits');
      await Promise.all([
        addCredits({ companyId, userId, amountCrb: 100, type: 'bonus', reference: 'referral_signup', metadata: { referrer: referredByUserId } }),
        // Referrer: find their company and credit it
        (async () => {
          const [refUser] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, referredByUserId));
          if (refUser?.companyId) {
            await addCredits({ companyId: refUser.companyId, userId: referredByUserId, amountCrb: 100, type: 'bonus', reference: 'referral_signup', metadata: { invitee: userId } });
          }
        })(),
      ]);
      await db.update(users).set({ referralBonusPaid: true } as any).where(eq(users.id, userId));
    } catch (err) {
      console.warn('referral bonus failed', err);
    }
  }

  // Create session
  const sessionId = await createSession(userId);

  return { userId, platformId, sessionId, companyId };
}

// ─── OAuth (Google / Apple) ─────────────────────────────────────────────
// Match by email (the provider has already verified it). New users get a
// random password hash + a fresh company; they can set a real password later
// via the reset flow. Returns a ready-to-use sessionId.
export async function findOrCreateOAuthUser(data: {
  email: string;
  name?: string;
  avatarUrl?: string | null;
  provider: 'google' | 'apple';
}) {
  const email = data.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    // Deactivated / soft-deleted accounts cannot be taken over via OAuth.
    if (existing.isActive === false || existing.deletedAt) {
      throw new Error('account_unavailable');
    }
    // Account-linking safety: only auto-login into an EXISTING account when it
    // has already verified its email. Otherwise an attacker who controls an
    // OAuth identity for an unverified, password-registered address could
    // silently seize the account. Require it to be verified first.
    if (!existing.emailVerified) {
      throw new Error('account_unverified');
    }
    // Backfill avatar/name (email already verified, provider re-vouches).
    const patch: Record<string, unknown> = {};
    if (data.avatarUrl && !existing.avatarUrl) patch.avatarUrl = data.avatarUrl;
    if (Object.keys(patch).length) {
      try { await db.update(users).set(patch as any).where(eq(users.id, existing.id)); } catch {}
    }
    // Surface totpEnabled so the caller can gate session creation behind 2FA.
    return {
      userId: existing.id,
      companyId: existing.companyId,
      created: false,
      totpEnabled: !!(existing as any).totpEnabled,
    };
  }

  // Create a company + owner user.
  const companyId = nanoid();
  const displayName = data.name?.trim() || email.split('@')[0];
  await db.insert(companies).values({
    id: companyId,
    name: displayName,
    country: 'Romania',
    subscriptionTier: 'free',
  } as any);

  const userId = nanoid();
  const platformId = await generatePlatformId();
  // Random, un-guessable password hash (user authenticates via OAuth).
  const randomSecret = nanoid(48);
  const hashedPassword = await hashPassword(randomSecret);
  const referralCode = platformId.replace(/^FM/i, '').toUpperCase();

  await db.insert(users).values({
    id: userId,
    platformId,
    email,
    emailVerified: true,
    hashedPassword,
    name: displayName,
    userType: 'intermediar',
    companyId,
    avatarUrl: data.avatarUrl || null,
    referralCode,
  } as any);

  return { userId, platformId, companyId, created: true, totpEnabled: false };
}

export async function loginUser(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    throw new Error('Email sau parolă incorectă');
  }
  // Deactivated / soft-deleted accounts cannot log in. Use the same generic
  // message so we don't leak account state.
  if (user.isActive === false || user.deletedAt) {
    throw new Error('Email sau parolă incorectă');
  }

  const valid = await verifyPassword(password, user.hashedPassword);
  if (!valid) {
    throw new Error('Email sau parolă incorectă');
  }

  const sessionId = await createSession(user.id);
  return { user, sessionId };
}
