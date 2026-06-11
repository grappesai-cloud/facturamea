// POST /api/push/test — sends a test push to all of the current user's
// subscriptions. Useful for the "Activează" button in settings.
import type { APIRoute } from 'astro';
import { sendPushToUser } from '../../../lib/webpush';

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const result = await sendPushToUser(locals.user.id, {
    title: 'facturamea',
    body: 'Notificări browser activate. Asta este un test.',
    url: '/app',
    tag: 'th-test',
  });
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
