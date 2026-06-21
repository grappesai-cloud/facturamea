import type { APIRoute } from 'astro';
import { db } from '../../db';
import { users, companies } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { createSession, setSessionCookie } from '../../lib/auth';
import { grantLifetime } from '../../lib/license';
import { rateLimitAsync, getClientIp } from '../../lib/security';

// One-click demo: logs the visitor into the shared, pre-seeded demo account
// (lifetime license, populated invoices/clients/expenses) so they can explore
// the full platform without signing up. Public, no auth required.
export const GET: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  const rl = await rateLimitAsync(`demo:${ip}`, 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    return new Response('Prea multe accesări demo. Încearcă din nou mai târziu.', { status: 429 });
  }

  const [u] = await db.select().from(users).where(eq(users.email, 'demo@facturamea.com'));
  if (!u) {
    return new Response('Contul demo nu este disponibil momentan.', { status: 503 });
  }

  // The demo account must satisfy the activation gate (complete fiscal profile
  // + lifetime) so the tour isn't bounced into onboarding. Ensure both here —
  // this runs server-side, so it reaches the live DB.
  if (u.companyId) {
    try {
      const [c] = await db.select().from(companies).where(eq(companies.id, u.companyId));
      if (c && (!c.cui || !c.address || !c.city)) {
        await db.update(companies).set({
          cui: c.cui || 'RO12345678',
          address: c.address || 'Str. Exemplu nr. 1',
          city: c.city || 'București',
          country: c.country || 'Romania',
        } as any).where(eq(companies.id, u.companyId));
      }
      await grantLifetime(u.companyId);
    } catch { /* best-effort; login still proceeds */ }
  }

  const sessionId = await createSession(u.id);
  return new Response(null, {
    status: 302,
    headers: { Location: '/app', 'Set-Cookie': setSessionCookie(sessionId) },
  });
};
