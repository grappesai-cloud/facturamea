import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { users, userCompanyMemberships } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { isValidRole } from '../../../../lib/permissions-roles';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function isOwner(locals: App.Locals): boolean {
  return locals.company?.role === 'owner' || !!locals.user?.isAdmin;
}

// PATCH — change a member's role.
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  if (!isOwner(locals)) return json({ error: 'Doar administratorul poate schimba rolurile' }, 403);

  const companyId = locals.user.companyId;
  const memberId = params.id;
  if (!companyId || !memberId) return json({ error: 'Date lipsă' }, 400);
  if (memberId === locals.user.id) return json({ error: 'Nu îți poți schimba propriul rol' }, 400);

  const body = (await request.json().catch(() => ({}))) as { role?: string };
  if (!isValidRole(body.role)) return json({ error: 'Rol invalid' }, 400);

  try {
    // Ensure the target belongs to this company.
    const [target] = await db
      .select({ companyId: users.companyId, parentUserId: users.parentUserId })
      .from(users)
      .where(eq(users.id, memberId));
    if (!target || (target.companyId !== companyId && target.parentUserId !== locals.user.id)) {
      return json({ error: 'Membru inexistent' }, 404);
    }

    // Upsert the membership role.
    const [existing] = await db
      .select({ userId: userCompanyMemberships.userId })
      .from(userCompanyMemberships)
      .where(and(eq(userCompanyMemberships.userId, memberId), eq(userCompanyMemberships.companyId, companyId)));

    if (existing) {
      await db
        .update(userCompanyMemberships)
        .set({ role: body.role } as any)
        .where(and(eq(userCompanyMemberships.userId, memberId), eq(userCompanyMemberships.companyId, companyId)));
    } else {
      await db.insert(userCompanyMemberships).values({
        userId: memberId,
        companyId,
        role: body.role,
        isDefault: false,
      } as any);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('team patch role failed:', err);
    return json({ error: 'Eroare la schimbarea rolului' }, 500);
  }
};

// DELETE — remove a member (soft-delete the user + drop the membership).
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  if (!isOwner(locals)) return json({ error: 'Doar administratorul poate șterge membri' }, 403);

  const companyId = locals.user.companyId;
  const memberId = params.id;
  if (!companyId || !memberId) return json({ error: 'Date lipsă' }, 400);
  if (memberId === locals.user.id) return json({ error: 'Nu te poți șterge pe tine însuți' }, 400);

  try {
    const [target] = await db
      .select({ companyId: users.companyId, parentUserId: users.parentUserId })
      .from(users)
      .where(eq(users.id, memberId));
    if (!target || (target.companyId !== companyId && target.parentUserId !== locals.user.id)) {
      return json({ error: 'Membru inexistent' }, 404);
    }

    await db
      .delete(userCompanyMemberships)
      .where(and(eq(userCompanyMemberships.userId, memberId), eq(userCompanyMemberships.companyId, companyId)));

    // Soft-delete + deactivate so it disappears from the team without a hard cascade.
    await db.update(users).set({ isActive: false, deletedAt: new Date() } as any).where(eq(users.id, memberId));

    return json({ ok: true });
  } catch (err) {
    console.error('team delete member failed:', err);
    return json({ error: 'Eroare la ștergerea membrului' }, 500);
  }
};
