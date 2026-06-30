// POST /api/public/support — receive a support / contact message and store it
// in the admin inbox (/admin/mesaje). NO email is sent anywhere. Public route
// (works for anonymous /contact visitors); if the sender is logged in, the
// middleware populates locals.user so we attach their id + company.
//
// Body: { message (required), email?, name?, topic?, source? ('app'|'contact') }
import type { APIRoute } from 'astro';
import { createSupportMessage } from '../../../lib/support';
import { captureError } from '../../../lib/observability';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'Cerere invalidă.' }, 400); }

  const message = String(body?.message || '').trim();
  if (!message) return json({ error: 'Mesajul este obligatoriu.' }, 400);
  if (message.length > 5000) return json({ error: 'Mesaj prea lung (max 5000 caractere).' }, 400);

  const source = body?.source === 'contact' ? 'contact' : 'app';
  const user = (locals as any).user || null;

  try {
    const id = await createSupportMessage({
      message,
      email: body?.email ?? user?.email ?? null,
      name: body?.name ?? user?.name ?? null,
      topic: body?.topic ?? null,
      source,
      userId: user?.id ?? null,
      companyId: user?.companyId ?? null,
      userAgent: request.headers.get('user-agent'),
    });
    return json({ ok: true, id });
  } catch (err) {
    await captureError(err, { route: '/api/public/support', method: 'POST', userId: user?.id });
    return json({ error: 'Nu am putut salva mesajul. Încearcă din nou.' }, 500);
  }
};
