// POST /api/anaf/etransport/declare
//
// Body — either:
//   { xml: "<eTransport...>", cif: "12345678", refId?: orderId }
// or:
//   { input: EtransportXmlInput, cif: "12345678", refId?: orderId }  (we build the XML)
//
// Returns: { ok, uit?, spvIndex?, submissionId, error? }
import type { APIRoute } from 'astro';
import { declareUit, buildEtransportXml, type EtransportXmlInput } from '../../../../lib/anaf/etransport';
import { db } from '../../../../db';
import { orders } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  if (!locals.user.companyId) return new Response(JSON.stringify({ error: 'Fără firmă' }), { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Body invalid' }), { status: 400 }); }

  const cif = String(body?.cif || '').replace(/^RO/i, '').replace(/\D/g, '');
  if (!cif) return new Response(JSON.stringify({ error: 'CIF lipsă' }), { status: 400 });

  let xml: string | null = null;
  if (typeof body.xml === 'string' && body.xml.trim().startsWith('<')) {
    xml = body.xml;
  } else if (body.input && typeof body.input === 'object') {
    try { xml = buildEtransportXml(body.input as EtransportXmlInput); }
    catch (e) { return new Response(JSON.stringify({ error: `Date invalide: ${e instanceof Error ? e.message : 'unknown'}` }), { status: 400 }); }
  } else {
    return new Response(JSON.stringify({ error: 'Nu s-a furnizat nici xml, nici input' }), { status: 400 });
  }

  // Verify the user's company actually owns/handles this order if refId is given.
  const refId = typeof body.refId === 'string' ? body.refId : undefined;
  if (refId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, refId)).limit(1);
    if (!o) return new Response(JSON.stringify({ error: 'Comanda nu există' }), { status: 404 });
    const cid = locals.user.companyId;
    if (o.clientCompanyId !== cid && o.carrierCompanyId !== cid) {
      return new Response(JSON.stringify({ error: 'Nu ești parte a comenzii' }), { status: 403 });
    }
  }

  if (!xml) return new Response(JSON.stringify({ error: 'XML lipsă' }), { status: 400 });

  const result = await declareUit(locals.user.companyId, {
    xml, cif, refType: refId ? 'order' : undefined, refId, userId: locals.user.id,
  });

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  });
};
