// GET /api/auth/me — current user + company + license, resolved from the
// Bearer token (or cookie). Used by the frontend to bootstrap the session.
import type { APIRoute } from 'astro';
import { licenseState } from '../../../lib/license';
import { isAnafConnected } from '../../../lib/anaf/tokens';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let license: any = null;
  let anafConnected = false;
  if (user.companyId) {
    try { license = await licenseState(user.companyId); } catch {}
    try { anafConnected = await isAnafConnected(user.companyId); } catch {}
  }
  return new Response(JSON.stringify({
    user: { id: user.id, name: user.name, email: user.email, platformId: user.platformId, isAdmin: user.isAdmin },
    company: locals.company,
    license,
    anafConnected,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
