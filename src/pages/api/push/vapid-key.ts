// GET /api/push/vapid-key
// Returns the VAPID public key so the client can call PushManager.subscribe.
// Returns 204 if Web Push isn't configured on the server.
import type { APIRoute } from 'astro';
import { vapidPublicKey } from '../../../lib/webpush';

export const GET: APIRoute = async () => {
  const key = vapidPublicKey();
  if (!key) return new Response(null, { status: 204 });
  return new Response(JSON.stringify({ key }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
};
