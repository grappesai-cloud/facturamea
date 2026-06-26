// POST /api/connectors/[id]/sync
// Pull finalized eMag orders for this connection and issue invoices for the ones
// not yet invoiced, then (best-effort) push the public invoice URL back onto the
// eMag order. User-triggered ("Sincronizează acum") so it's testable without a
// cron; a scheduled task can call the same path later.
//
// Idempotency: createInvoiceFromMappedOrder dedupes on the per-order note, so a
// re-sync of the same finalized order never double-invoices.
import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { integrationConnections, transportInvoices } from '../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../../../../lib/require-role';
import { parseEmagCreds, emagReadOrders, emagAttachInvoice } from '../../../../lib/emag';
import { mapEmagOrderToInvoice, createInvoiceFromMappedOrder } from '../../../../lib/connectors';
import { captureError } from '../../../../lib/observability';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const publicBase = () => process.env.PUBLIC_BASE_URL || 'https://facturamea.com';

export const POST: APIRoute = async ({ params, locals }) => {
  const denied = requireRole(locals, 'settings.manage'); if (denied) return denied;
  if (!locals.user) return json({ error: 'Neautorizat' }, 401);
  const cid = locals.user.companyId;
  if (!cid) return json({ error: 'Companie lipsă' }, 400);

  const id = String(params.id || '');
  const [conn] = await db.select().from(integrationConnections)
    .where(and(eq(integrationConnections.id, id), eq(integrationConnections.companyId, cid)))
    .limit(1);
  if (!conn) return json({ error: 'Conexiune inexistentă' }, 404);
  if (conn.provider !== 'emag') return json({ error: 'Sincronizarea manuală e doar pentru eMag' }, 400);
  if (!conn.isActive) return json({ error: 'Conexiune inactivă' }, 400);

  const creds = parseEmagCreds(conn.configEnc);
  if (!creds) return json({ error: 'Credențiale eMag lipsă sau corupte' }, 400);

  // Only pull orders changed since the last successful sync (full pull first time).
  const modifiedAfter = conn.lastEventAt
    ? new Date(conn.lastEventAt).toISOString().slice(0, 19).replace('T', ' ')
    : undefined;

  let orders: any[];
  try {
    orders = await emagReadOrders(creds, { status: 4, page: 1, perPage: 100, modifiedAfter });
  } catch (err) {
    await captureError(err, { userId: locals.user.id, companyId: cid, route: '/api/connectors/[id]/sync', method: 'POST', extra: { id } });
    return json({ error: (err as Error)?.message || 'Eroare la citirea comenzilor eMag' }, 502);
  }

  let invoiced = 0;
  let attached = 0;
  const attachErrors: string[] = [];

  for (const order of orders) {
    const mapped = mapEmagOrderToInvoice(order);
    const note = `Comandă eMag #${mapped.externalOrderRef ?? order?.id ?? ''}`.trim();
    const created = conn.autoInvoice
      ? await createInvoiceFromMappedOrder(cid, locals.user.id, mapped, note)
      : null;
    if (!created) continue; // dup, auto-invoice off, or no lines
    invoiced += 1;

    // Push the invoice back to eMag (best-effort): ensure a public share token,
    // then attach the public link. A failure here never fails the whole sync.
    try {
      const token = nanoid(24);
      await db.update(transportInvoices)
        .set({ shareToken: token, updatedAt: new Date() })
        .where(eq(transportInvoices.id, created.id));
      await emagAttachInvoice(creds, order.id, `${publicBase()}/factura/${token}`, `Factura ${created.fullNumber}`);
      attached += 1;
    } catch (err) {
      attachErrors.push(`#${order?.id}: ${(err as Error)?.message || 'attach failed'}`);
    }
  }

  await db.update(integrationConnections)
    .set({ lastEventAt: new Date() })
    .where(eq(integrationConnections.id, conn.id))
    .catch(() => {});

  return json({ ok: true, pulled: orders.length, invoiced, attached, attachErrors });
};
