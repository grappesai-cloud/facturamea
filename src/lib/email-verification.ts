import { db } from '../db';
import { emailVerificationTokens } from '../db/schema';
import { nanoid } from 'nanoid';
import { sendEmail } from './notifications';
import { emailVerificationEmail } from './email-templates';

const EXPIRES_HOURS = 24;

// Creates a single-use email-verification token and emails the confirm link.
// Best-effort: callers wrap in try/catch so a mail failure never blocks signup.
// Verification is SOFT (login still works); the link just flips emailVerified.
export async function createAndSendVerification(
  userId: string,
  email: string,
  origin: string,
): Promise<void> {
  const token = nanoid(48);
  await db.insert(emailVerificationTokens).values({
    id: nanoid(),
    userId,
    token,
    expiresAt: new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000),
  });
  const verifyUrl = `${origin.replace(/\/+$/, '')}/auth/verify-email?token=${token}`;
  const { subject, html, text } = emailVerificationEmail({ verifyUrl, expiresInHours: EXPIRES_HOURS });
  await sendEmail(email, subject, text, html);
}
