import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users, userCompanyMemberships } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generatePlatformId } from '../../../../lib/platform-id';
import { hashPassword } from '../../../../lib/auth';
import { isValidRole, normalizeRole, ROLE_LABELS } from '../../../../lib/permissions-roles';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Only a company owner (or platform admin) may manage the team.
function isOwner(locals: App.Locals): boolean {
  return locals.company?.role === 'owner' || !!locals.user?.isAdmin;
}

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
  if (!isOwner(locals)) return json({ error: 'Doar administratorul poate adăuga membri' }, 403);

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

    return json({ ok: true, userId, platformId }, 201);
  } catch (err) {
    console.error('team add member failed:', err);
    return json({ error: 'Eroare la adăugarea membrului' }, 500);
  }
};
