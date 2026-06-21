import { can, normalizeRole, type Action, type CompanyRole } from './permissions-roles';

// Returns a 403 Response if the current user may not perform `action`, else null.
// Platform admins bypass. Resolves role from locals.company.role (set by middleware).
export function requireRole(locals: App.Locals, action: Action): Response | null {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if ((user as any).isAdmin) return null;
  const role: CompanyRole = (locals.company?.role as CompanyRole) ?? (user.isSubUser ? 'operator' : 'owner');
  if (!can(role, action)) {
    return new Response(JSON.stringify({ error: 'Acces interzis pentru rolul tău.' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  return null;
}
