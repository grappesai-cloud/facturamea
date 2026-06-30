// POST /api/admin/support — admin marks a support message resolved / reopened.
// Body: { id, status: 'resolved' | 'new' }. Admin-only.
import type { APIRoute } from 'astro';
import { setSupportStatus } from '../../../lib/support';
import { captureError } from '../../../lib/observability';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.isAdmin) return json({ error: 'Forbidden' }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Cerere invalidă.' }, 400); }

  const id = String(body?.id || '').trim();
  const status = body?.status === 'resolved' ? 'resolved' : 'new';
  if (!id) return json({ error: 'id lipsă' }, 400);

  try {
    await setSupportStatus(id, status, locals.user.id);
    return json({ ok: true });
  } catch (err) {
    await captureError(err, { route: '/api/admin/support', method: 'POST', userId: locals.user.id });
    return json({ error: 'Eroare la actualizare.' }, 500);
  }
};
