import type { APIRoute } from 'astro';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { createSession, setSessionCookie } from '../../lib/auth';
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

  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, 'demo@facturamea.com'));
  if (!u) {
    return new Response('Contul demo nu este disponibil momentan.', { status: 503 });
  }

  const sessionId = await createSession(u.id);
  return new Response(null, {
    status: 302,
    headers: { Location: '/app', 'Set-Cookie': setSessionCookie(sessionId) },
  });
};
