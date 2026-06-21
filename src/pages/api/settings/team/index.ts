import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users, userCompanyMemberships, companies, passwordResetTokens } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generatePlatformId } from '../../../../lib/platform-id';
import { hashPassword } from '../../../../lib/auth';
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

    // Send an invite email with a set-password link (reuses the reset-token
    // flow, 7-day expiry for invites). Without this the new member has a random
    // password and no way to get in.
    let invited = false;
    try {
      const token = nanoid(48);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(passwordResetTokens).values({ id: nanoid(), userId, token, expiresAt } as any);
      const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
      const companyName = co?.name || 'compania';
      const inviter = locals.user.name || 'Administratorul';
      const roleLabel = ROLE_LABELS[normalizeRole(role)];
      const link = `https://facturamea.com/auth/reset-password?token=${token}`;
      const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const subject = `Ai fost adăugat în echipa ${companyName} pe facturamea`;
      const text = `Bună ${name},\n${inviter} te-a adăugat în echipa "${companyName}" pe facturamea, cu rolul ${roleLabel}.\nSetează-ți parola și intră în cont: ${link}\nLinkul e valabil 7 zile.`;
      const html = `<p>Bună ${esc(name)},</p><p><strong>${esc(inviter)}</strong> te-a adăugat în echipa <strong>${esc(companyName)}</strong> pe facturamea, cu rolul <strong>${esc(roleLabel)}</strong>.</p><p><a href="${link}">Setează-ți parola și intră în cont</a> — link valabil 7 zile.</p>`;
      // Fire-and-forget: member creation must not block on (or fail with) email.
      void sendEmail(email, subject, text, html).catch((e) => console.error('team invite email failed:', e));
      invited = true;
    } catch (err) {
      console.error('team invite token failed:', err);
    }

    return json({ ok: true, userId, platformId, invited }, 201);
  } catch (err) {
    console.error('team add member failed:', err);
    return json({ error: 'Eroare la adăugarea membrului' }, 500);
  }
};
