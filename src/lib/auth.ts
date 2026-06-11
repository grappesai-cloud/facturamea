import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users, sessions, companies } from '../db/schema';
import { eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generatePlatformId } from './platform-id';

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

export async function createSession(userId: string): Promise<string> {
  const sessionId = nanoid(32);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
  });

  return sessionId;
}

export async function getSession(cookieHeader: string | null) {
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...val] = c.trim().split('=');
      return [key, val.join('=')];
    })
  );

  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) return null;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session) return null;

  // Check expiration
  if (session.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return null;

  return { session, user };
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
    // Mark verified (provider vouches for the address) + backfill avatar/name.
    const patch: Record<string, unknown> = {};
    if (!existing.emailVerified) patch.emailVerified = true;
    if (data.avatarUrl && !existing.avatarUrl) patch.avatarUrl = data.avatarUrl;
    if (Object.keys(patch).length) {
      try { await db.update(users).set(patch as any).where(eq(users.id, existing.id)); } catch {}
    }
    const sessionId = await createSession(existing.id);
    return { userId: existing.id, sessionId, companyId: existing.companyId, created: false };
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

  const sessionId = await createSession(userId);
  return { userId, platformId, sessionId, companyId, created: true };
}

export async function loginUser(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    throw new Error('Email sau parolă incorectă');
  }

  const valid = await verifyPassword(password, user.hashedPassword);
  if (!valid) {
    throw new Error('Email sau parolă incorectă');
  }

  const sessionId = await createSession(user.id);
  return { user, sessionId };
}
