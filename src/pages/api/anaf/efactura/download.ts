// GET /api/anaf/efactura/download?id=<spv_message_id>
//   — proxies the ZIP returned by ANAF (contains XML + signature).
import type { APIRoute } from 'astro';
import { downloadMessage } from '../../../../lib/anaf/efactura-client';

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'id lipsă' }), { status: 400 });
  const r = await downloadMessage(locals.user.companyId, id);
  if (!r.ok || !r.bytes) return new Response(JSON.stringify({ error: r.error }), { status: 502 });
  return new Response(r.bytes, {
    headers: {
      'Content-Type': r.contentType || 'application/zip',
      'Content-Disposition': `attachment; filename="anaf-${id}.zip"`,
    },
  });
};
