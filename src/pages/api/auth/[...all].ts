import type { APIRoute } from 'astro';
import { registerUser, loginUser, setSessionCookie, clearSessionCookie, hashPassword, verifyAndMaybeRehash, createSession, revokeAllSessionsForUser, deleteSessionByRawToken, hashToken } from '../../../lib/auth';
import { db } from '../../../db';
import { users, passwordResetTokens, totpPendingLogins } from '../../../db/schema';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { rateLimitAsync, getClientIp, checkLoginLockoutAsync, recordFailedLoginAsync, clearLoginAttemptsAsync, generateResetToken, sanitizeHtml } from '../../../lib/security';
import { sendEmail } from '../../../lib/notifications';
import { verifyTurnstile } from '../../../lib/turnstile';
import { passwordResetEmail } from '../../../lib/email-templates';
import { logAction } from '../../../lib/audit';
import { captureError } from '../../../lib/observability';

export const POST: APIRoute = async ({ request, url }) => {
  const path = url.pathname;
  const clientIp = getClientIp(request);

  // ─── REGISTER ───────────────────────────────
  if (path.endsWith('/sign-up') || path.endsWith('/register')) {
    // Rate limit: 5 registrations per IP per hour
    const rl = await rateLimitAsync(`register:${clientIp}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: `Prea multe încercări. Așteaptă ${Math.ceil(rl.resetIn / 60000)} minute.` }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      const { name, email, password, userType, phone, companyName, cui, country, city, companyPhone, referralCode, depot, gps } = body;

      // Anti-bot: Cloudflare Turnstile (enforced only when TURNSTILE_SECRET is set;
      // fail-open otherwise). The register form already renders the widget + sends
      // the token. Honeypot: bots fill every field, real users never see `website`.
      if (typeof body.website === 'string' && body.website.trim() !== '') {
        return new Response(JSON.stringify({ success: true, pendingVerification: true }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      const turn = await verifyTurnstile(String(body.turnstileToken || ''), clientIp);
      if (!turn.ok) {
        return new Response(JSON.stringify({ error: 'Verificarea anti-bot a eșuat. Reîncarcă pagina și încearcă din nou.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      if (!name || !email || !password || !companyName) {
        return new Response(JSON.stringify({ error: 'Câmpuri obligatorii lipsă' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // T&C acceptance is mandatory (Cap. 1.2 — bifa = semnătură electronică).
      if (body.termsAccepted !== true) {
        return new Response(JSON.stringify({ error: 'Trebuie să accepți Termenii și Condițiile și Politica de Confidențialitate.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Invoicing platform for everyone: every account is a business owner.
      // userType is optional and defaults to 'intermediar' (full access).
      const userTypeResolved = userType === 'transportator' ? 'transportator' : 'intermediar';

      if (password.length < 8) {
        return new Response(JSON.stringify({ error: 'Parola trebuie să aibă minim 8 caractere' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Mandatory email verification + no account enumeration: respond
      // IDENTICALLY whether or not the address already exists. If it exists, we
      // send a heads-up email to the real owner instead of creating a duplicate
      // (also avoids the orphan-company that the unique-violation path created).
      const regEmail = email.trim().toLowerCase();
      const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, regEmail));
      if (existingUser) {
        try {
          await sendEmail(
            regEmail,
            'Ai deja un cont facturamea',
            'Cineva a încercat să creeze un cont nou cu această adresă. Dacă ai fost tu, autentifică-te sau resetează-ți parola.',
            `<p>Cineva a încercat să creeze un cont nou cu această adresă pe facturamea.</p><p>Dacă ai fost tu, <a href="${url.origin}/auth/login">autentifică-te</a> sau <a href="${url.origin}/auth/forgot-password">resetează-ți parola</a>.</p>`,
          );
        } catch (e) { console.warn('account-exists notice email failed', e); }
        return new Response(JSON.stringify({ success: true, pendingVerification: true }), {
          status: 201, headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await registerUser({
        name: sanitizeHtml(name.trim()),
        email: email.trim().toLowerCase(),
        password,
        userType: userTypeResolved,
        phone: phone?.trim(),
        companyName: sanitizeHtml(companyName.trim()),
        cui: cui?.trim(),
        country: country?.trim() || 'Romania',
        city: city?.trim(),
        companyPhone: companyPhone?.trim(),
        referralCode: referralCode?.trim() || undefined,
      });

      // Record T&C acceptance as proof (timestamp + IP via the audit log).
      try {
        await logAction({ userId: result.userId, companyId: result.companyId, action: 'auth.terms_accepted', entityType: 'user', entityId: result.userId, metadata: { version: '1.1' }, request });
      } catch {}

      // Comp lifetime allowlist — specific emails get a free lifetime license on
      // signup (no Stripe charge). Configurable via FREE_LIFETIME_EMAILS (comma
      // separated, case-insensitive); defaults to the cofounder/QA address.
      try {
        const allow = (import.meta.env.FREE_LIFETIME_EMAILS || process.env.FREE_LIFETIME_EMAILS || 'gyorgyalbertrobert@gmail.com')
          .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
        if (result.companyId && allow.includes(email.trim().toLowerCase())) {
          const { grantLifetime } = await import('../../../lib/license');
          await grantLifetime(result.companyId, { amountCents: 0 });
          await logAction({ userId: result.userId, companyId: result.companyId, action: 'license.comp_granted', entityType: 'company', entityId: result.companyId, metadata: { reason: 'free_lifetime_allowlist' }, request });
        }
      } catch (e) {
        console.warn('comp lifetime grant failed at register', e);
      }

      // Optional depot — if user has one, persist as a companyLocation of type 'warehouse'.
      if (result.companyId && depot && typeof depot === 'object' && depot.city) {
        try {
          const { db } = await import('../../../db');
          const { companyLocations } = await import('../../../db/schema');
          const { nanoid } = await import('nanoid');
          await db.insert(companyLocations).values({
            id: nanoid(),
            companyId: result.companyId,
            type: 'warehouse',
            name: sanitizeHtml(String(depot.name || 'Depozit principal').trim()).slice(0, 200),
            countryCode: String(depot.country || country || 'RO').slice(0, 5),
            city: sanitizeHtml(String(depot.city).trim()).slice(0, 200),
            address: depot.address ? sanitizeHtml(String(depot.address).trim()) : null,
            postalCode: depot.postalCode ? String(depot.postalCode).slice(0, 20) : null,
            phone: depot.phone ? String(depot.phone).slice(0, 50) : null,
            contactName: depot.contactName ? sanitizeHtml(String(depot.contactName).trim()).slice(0, 200) : null,
            openingHours: depot.openingHours ? sanitizeHtml(String(depot.openingHours).trim()) : null,
            notes: depot.notes ? sanitizeHtml(String(depot.notes).trim()) : null,
            isPrimary: true,
          });
        } catch (e) {
          console.warn('Depot creation failed at register', e);
        }
      }

      // Optional GPS/CargoTrack credentials — connect the company's telematics
      // account at signup so trucks are tracked from day one. Stored encrypted.
      if (result.companyId && gps && typeof gps === 'object' && gps.username && gps.password) {
        try {
          const { db } = await import('../../../db');
          const { gpsIntegrations } = await import('../../../db/schema');
          const { nanoid } = await import('nanoid');
          const { encryptSecret } = await import('../../../lib/crypto');
          const provider = typeof gps.provider === 'string' && gps.provider ? gps.provider : 'cargotrack';
          const credsObj = (gps.credentials && typeof gps.credentials === 'object')
            ? gps.credentials
            : { username: String(gps.username), password: String(gps.password) };
          const label = String(credsObj.username || credsObj.account || credsObj.apiKey || provider).slice(0, 255);
          await db.insert(gpsIntegrations).values({
            id: nanoid(),
            companyId: result.companyId,
            provider,
            username: label,
            configEnc: encryptSecret(JSON.stringify(credsObj)),
            isActive: true,
          });
        } catch (e) {
          console.warn('GPS integration creation failed at register', e);
        }
      }

      // Send a confirmation email (best-effort — never blocks signup). The
      // account is usable immediately; verifying just flips emailVerified.
      try {
        const { createAndSendVerification } = await import('../../../lib/email-verification');
        await createAndSendVerification(result.userId, email.trim().toLowerCase(), url.origin);
      } catch (e) {
        console.warn('verification email send failed at register', e);
      }

      await logAction({ userId: result.userId, companyId: result.companyId, action: 'auth.register', request });

      // Mandatory verification: do NOT log the user in. They confirm via the
      // email link, then sign in. (A session row may exist from registerUser
      // but no cookie is set, so it's unreachable.)
      return new Response(JSON.stringify({ success: true, pendingVerification: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      // Never leak internal error text/stack to the client.
      await captureError(err, { route: path, method: 'POST' });
      return new Response(JSON.stringify({ error: 'Înregistrarea nu a putut fi finalizată. Încearcă din nou.' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ─── LOGIN ──────────────────────────────────
  if (path.endsWith('/sign-in') || path.endsWith('/login')) {
    // Rate limit: 10 login attempts per IP per 15 minutes
    const rl = await rateLimitAsync(`login:${clientIp}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: `Prea multe încercări. Așteaptă ${Math.ceil(rl.resetIn / 60000)} minute.` }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      const { email, password } = body;

      if (!email || !password) {
        return new Response(JSON.stringify({ error: 'Email și parola sunt obligatorii' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      // Anti-bot (CAPTCHA). No-op until TURNSTILE_SECRET is configured; once it
      // is, a valid token from the login widget is required (blocks scripted
      // credential-stuffing). The widget is in LoginForm, gated on the site key.
      const ts = await verifyTurnstile(body.turnstileToken || '', clientIp);
      if (!ts.ok) {
        return new Response(JSON.stringify({ error: 'Verificare anti-bot eșuată. Reîncarcă pagina și încearcă din nou.' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check account lockout
      const lockout = await checkLoginLockoutAsync(normalizedEmail);
      if (lockout.locked) {
        return new Response(JSON.stringify({ error: `Cont blocat temporar. Încearcă din nou în ${lockout.minutesRemaining} minute.` }), {
          status: 423, headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        // Manual verify so we can branch on totpEnabled before creating a session
        const [u] = await db.select().from(users).where(eq(users.email, normalizedEmail));
        if (!u) throw new Error('invalid');
        // Deactivated / soft-deleted accounts cannot log in (generic error).
        if (u.isActive === false || u.deletedAt) throw new Error('invalid');
        const verify = await verifyAndMaybeRehash(password, u.hashedPassword);
        if (!verify.valid) throw new Error('invalid');
        if (verify.newHash) {
          // Lazy upgrade: cost was below current target. Best-effort.
          try {
            await db.update(users).set({ hashedPassword: verify.newHash }).where(eq(users.id, u.id));
          } catch (err) {
            console.warn('bcrypt rehash failed', err);
          }
        }

        await clearLoginAttemptsAsync(normalizedEmail);

        // Mandatory email verification. Password was correct (not a failed
        // attempt), so we block here and AUTO-RESEND the confirmation link —
        // the recovery path so a user who lost the email is never stuck.
        // Existing pre-feature accounts were grandfathered (email_verified=true).
        if (!u.emailVerified) {
          try {
            const { createAndSendVerification } = await import('../../../lib/email-verification');
            await createAndSendVerification(u.id, u.email, url.origin);
          } catch (e) { console.warn('resend verification at login failed', e); }
          return new Response(JSON.stringify({ error: 'Confirmă-ți adresa de email. Ți-am retrimis linkul de confirmare.' }), {
            status: 403, headers: { 'Content-Type': 'application/json' },
          });
        }

        // 2FA gate: if user has TOTP enabled, issue a short-lived pending
        // handle instead of a full session. Client posts that handle + the
        // 6-digit code to /api/auth/totp/verify to complete login.
        if (u.totpEnabled) {
          const handle = nanoid(32);
          const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
          await db.insert(totpPendingLogins).values({ id: handle, userId: u.id, expiresAt } as any);
          await logAction({ userId: u.id, companyId: u.companyId, action: 'auth.login_totp_pending', request });
          return new Response(JSON.stringify({ requireTotp: true, handle }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          });
        }

        const sessionId = await createSession(u.id);
        await logAction({ userId: u.id, companyId: u.companyId, action: 'auth.login', request });

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': setSessionCookie(sessionId),
          },
        });
      } catch {
        await recordFailedLoginAsync(normalizedEmail);
        return new Response(JSON.stringify({ error: 'Email sau parolă incorectă' }), {
          status: 401, headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Eroare de conectare' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ─── LOGOUT ─────────────────────────────────
  if (path.endsWith('/sign-out') || path.endsWith('/logout')) {
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c) => {
          const [key, ...val] = c.trim().split('=');
          return [key, val.join('=')];
        })
      );
      const sessionId = cookies['th_session'];
      if (sessionId) {
        // Sessions are stored hashed — delete via the raw-token helper.
        await deleteSessionByRawToken(sessionId);
      }
    }

    return new Response(null, {
      status: 302,
      headers: { 'Location': '/', 'Set-Cookie': clearSessionCookie() },
    });
  }

  // ─── PASSWORD RESET REQUEST ─────────────────
  if (path.endsWith('/forgot-password')) {
    const rl = await rateLimitAsync(`forgot:${clientIp}`, 3, 60 * 60 * 1000);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Prea multe cereri. Încearcă mai târziu.' }), {
        status: 429, headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { email } = await request.json();
      const normalizedEmail = email?.trim().toLowerCase();

      if (!normalizedEmail) {
        return new Response(JSON.stringify({ error: 'Email obligatoriu' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, normalizedEmail));

      // Always return success to prevent email enumeration
      if (user) {
        const token = generateResetToken();
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        const { nanoid } = await import('nanoid');
        await db.insert(passwordResetTokens).values({
          id: nanoid(),
          userId: user.id,
          token: hashToken(token), // store hash; raw token goes only in the email link
          expiresAt,
        });

        try {
          const resetUrl = `https://facturamea.com/auth/reset-password?token=${token}`;
          const email = passwordResetEmail({ resetUrl, expiresInHours: 1 }, 'ro');
          await sendEmail(user.email, email.subject, email.text, email.html);
        } catch (err) {
          console.error('Password reset email failed:', err);
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Dacă emailul există, vei primi un link de resetare.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
    }
  }

  // ─── MEMBER JOIN via one-time code (no email needed) ─────────────────────
  if (path.endsWith('/join')) {
    try {
      const clientIp = getClientIp(request);
      const rl = await rateLimitAsync(`join:${clientIp}`, 10, 15 * 60 * 1000);
      if (!rl.allowed) {
        return new Response(JSON.stringify({ error: 'Prea multe încercări. Încearcă mai târziu.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
      const { code, password } = await request.json();
      const norm = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!norm || !password || String(password).length < 8) {
        return new Response(JSON.stringify({ error: 'Cod și parolă obligatorii (parola minim 8 caractere).' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const [tok] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashToken(norm)));
      if (!tok || tok.usedAt || new Date(tok.expiresAt) < new Date()) {
        return new Response(JSON.stringify({ error: 'Cod invalid sau expirat. Cere administratorului un cod nou.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const hashed = await hashPassword(String(password));
      await db.update(users).set({ hashedPassword: hashed, emailVerified: true } as any).where(eq(users.id, tok.userId));
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, tok.id));
      const sessionId = await createSession(tok.userId);
      try { await logAction({ userId: tok.userId, action: 'team.member_joined', request }); } catch {}
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': setSessionCookie(sessionId) } });
    } catch {
      return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
    }
  }

  // ─── PASSWORD RESET CONFIRM ─────────────────
  if (path.endsWith('/reset-password')) {
    try {
      const { token, newPassword } = await request.json();

      if (!token || !newPassword || newPassword.length < 8) {
        return new Response(JSON.stringify({ error: 'Token și parolă nouă obligatorii (min 8 caractere)' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const [resetToken] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashToken(token)));

      if (!resetToken || resetToken.usedAt) {
        return new Response(JSON.stringify({ error: 'Link invalid sau expirat' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      if (new Date(resetToken.expiresAt) < new Date()) {
        return new Response(JSON.stringify({ error: 'Link expirat. Solicită un nou link.' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }

      const hashedPassword = await hashPassword(newPassword);
      await db.update(users).set({ hashedPassword }).where(eq(users.id, resetToken.userId));
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, resetToken.id));
      // Kick out all existing sessions so an attacker who'd hijacked one
      // is forced to re-authenticate with the new password.
      await revokeAllSessionsForUser(resetToken.userId);

      return new Response(JSON.stringify({ success: true, message: 'Parola a fost schimbată. Te poți conecta.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Eroare' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Rută necunoscută' }), {
    status: 404, headers: { 'Content-Type': 'application/json' },
  });
};

export const GET: APIRoute = async ({ url }) => {
  if (url.pathname.endsWith('/sign-out') || url.pathname.endsWith('/logout')) {
    return new Response(null, { status: 302, headers: { 'Location': '/' } });
  }
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  });
};
