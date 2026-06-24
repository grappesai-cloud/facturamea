import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users, userCompanyMemberships, companies, passwordResetTokens } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid, customAlphabet } from 'nanoid';

// Readable code, no ambiguous chars (no 0/O/1/I). 10 chars ≈ 50 bits.
const genJoinCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 10);
import { generatePlatformId } from '../../../../lib/platform-id';
import { hashPassword, hashToken } from '../../../../lib/auth';
import { isValidRole, normalizeRole, ROLE_LABELS } from '../../../../lib/permissions-roles';
import { requireRole } from '../../../../lib/require-role';
import { sendEmail } from '../../../../lib/notifications';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// GET — list team members of the current company.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const companyId = locals.user.companyId;
  if (!companyId) return json({ members: [] });

  try {
    // Members linked to the company via memberships.
    const memberships = await db
      .select({
        userId: userCompanyMemberships.userId,
        role: userCompanyMemberships.role,
        joinedAt: userCompanyMemberships.joinedAt,
        name: users.name,
        email: users.email,
        platformId: users.platformId,
        isActive: users.isActive,
        parentUserId: users.parentUserId,
      })
      .from(userCompanyMemberships)
      .innerJoin(users, eq(userCompanyMemberships.userId, users.id))
      .where(eq(userCompanyMemberships.companyId, companyId));

    // Sub-users created under the current user that may not yet have a membership row.
    const subUsers = await db
      .select({
        userId: users.id,
        role: users.userType,
        joinedAt: users.createdAt,
        name: users.name,
        email: users.email,
        platformId: users.platformId,
        isActive: users.isActive,
        parentUserId: users.parentUserId,
      })
      .from(users)
      .where(eq(users.parentUserId, locals.user.id));

    const seen = new Set(memberships.map((m) => m.userId));
    const merged = [
      ...memberships.map((m) => ({
        userId: m.userId,
        name: m.name,
        email: m.email,
        platformId: m.platformId,
        isActive: m.isActive,
        role: normalizeRole(m.role),
        roleLabel: ROLE_LABELS[normalizeRole(m.role)],
        joinedAt: m.joinedAt,
        isSelf: m.userId === locals.user!.id,
      })),
      ...subUsers
        .filter((s) => !seen.has(s.userId))
        .map((s) => ({
          userId: s.userId,
          name: s.name,
          email: s.email,
          platformId: s.platformId,
          isActive: s.isActive,
          role: 'operator' as const,
          roleLabel: ROLE_LABELS.operator,
          joinedAt: s.joinedAt,
          isSelf: false,
        })),
    ];

    return json({ members: merged });
  } catch {
    return json({ members: [] });
  }
};

// POST — add a team member (creates a sub-user + membership row).
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const denied = requireRole(locals, 'team.manage'); if (denied) return denied;

  const companyId = locals.user.companyId;
  if (!companyId) return json({ error: 'Companie lipsă' }, 400);

  const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string; role?: string };
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role;

  if (!name) return json({ error: 'Nume obligatoriu' }, 400);
  if (!email) return json({ error: 'Email obligatoriu' }, 400);
  if (!isValidRole(role)) return json({ error: 'Rol invalid' }, 400);

  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (existing) return json({ error: 'Acest email este deja folosit' }, 409);

    const userId = nanoid();
    const platformId = await generatePlatformId();
    // Random unguessable password; the member resets it via the reset flow.
    const hashedPassword = await hashPassword(nanoid(32));

    await db.insert(users).values({
      id: userId,
      platformId,
      email,
      hashedPassword,
      name,
      userType: 'intermediar',
      companyId,
      parentUserId: locals.user.id,
    } as any);

    await db.insert(userCompanyMemberships).values({
      userId,
      companyId,
      role,
      isDefault: false,
    } as any);

    // Generate a one-time JOIN CODE (no email needed). The owner shares it with
    // the member out-of-band (WhatsApp/in person); the member activates at
    // /auth/membru by entering the code + setting a password. Stored in the
    // reset-token table (token = code), 30-day expiry. Email is a best-effort
    // bonus on top (fire-and-forget) when a provider is configured.
    let code = '';
    try {
      code = genJoinCode(); // e.g. "K7M2PQR9TX"
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(passwordResetTokens).values({ id: nanoid(), userId, token: hashToken(code), expiresAt } as any);
      const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
      const companyName = co?.name || 'compania';
      const inviter = locals.user.name || 'Administratorul';
      const roleLabel = ROLE_LABELS[normalizeRole(role)];
      const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const subject = `Ai fost adăugat în echipa ${companyName} pe facturamea`;
      const text = `Bună ${name},\n${inviter} te-a adăugat în echipa "${companyName}" pe facturamea, cu rolul ${roleLabel}.\nIntră pe https://facturamea.com/auth/membru și folosește codul: ${code}\nCodul e valabil 30 de zile.`;
      const html = `<p>Bună ${esc(name)},</p><p><strong>${esc(inviter)}</strong> te-a adăugat în echipa <strong>${esc(companyName)}</strong> pe facturamea, cu rolul <strong>${esc(roleLabel)}</strong>.</p><p>Intră pe <a href="https://facturamea.com/auth/membru">facturamea.com/auth/membru</a> și folosește codul: <strong style="font-size:18px;letter-spacing:2px">${esc(code)}</strong></p><p>Cod valabil 30 de zile.</p>`;
      void sendEmail(email, subject, text, html).catch((e) => console.error('team invite email failed:', e));
    } catch (err) {
      console.error('team join code failed:', err);
    }

    return json({ ok: true, userId, platformId, code, joinUrl: 'https://facturamea.com/auth/membru' }, 201);
  } catch (err) {
    console.error('team add member failed:', err);
    return json({ error: 'Eroare la adăugarea membrului' }, 500);
  }
};
