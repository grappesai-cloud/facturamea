// POST /api/invoicing/invoices/[id]/dispute
// "Marchează neîncasată → sesizează incident de plată".
// Marks an issued invoice as `disputed` and, when the client is a
// facturamea-registered company, opens a payment_delay incident against it
// (linked to the order if any) and notifies the client — who then has a right
// of reply through the incidents module. External (off-platform) clients can't
// be the target of a platform incident, so the invoice is only marked disputed.

import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, incidents, users, companies } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { notify } from '../../../../../lib/notifications';
import { logAction } from '../../../../../lib/audit';
import { recomputeCompanyPaymentScore } from '../../../../../lib/payment-scoring';
import { requireRole } from '../../../../../lib/require-role';

export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  { const denied = requireRole(locals, 'invoice.create'); if (denied) return denied; }
  const cid = locals.user.companyId;
  if (!cid) return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });

  const [inv] = await db.select().from(transportInvoices)
    .where(and(eq(transportInvoices.id, params.id!), eq(transportInvoices.companyId, cid)))
    .limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });
  if (inv.kind !== 'factura') return new Response(JSON.stringify({ error: 'Doar facturile pot fi sesizate' }), { status: 400 });
  if (['draft', 'voided', 'paid'].includes(inv.status)) {
    return new Response(JSON.stringify({ error: 'Factura nu poate fi sesizată în acest status' }), { status: 400 });
  }

  await db.update(transportInvoices)
    .set({ status: 'disputed', updatedAt: new Date() })
    .where(eq(transportInvoices.id, inv.id));

  let incidentId: string | null = null;
  const remaining = (inv.totalCents - inv.paidCents) / 100;
  const dueStr = inv.dueAt ? new Date(inv.dueAt).toLocaleDateString('ro-RO') : null;
  const amountStr = `${remaining.toLocaleString('ro-RO', { minimumFractionDigits: 2 })} ${inv.currency}`;

  // Only a TH-registered client company can be the incident target.
  if (inv.clientCompanyId && inv.clientCompanyId !== cid) {
    const [issuer] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, cid)).limit(1);
    const issuerName = issuer?.name || 'Un partener';

    incidentId = nanoid();
    await db.insert(incidents).values({
      id: incidentId,
      orderId: inv.orderId || null,
      reporterUserId: locals.user.id,
      reporterCompanyId: cid,
      againstCompanyId: inv.clientCompanyId,
      category: 'payment_delay',
      title: `Neîncasare factură ${inv.fullNumber}`,
      body: `Factura ${inv.fullNumber}${dueStr ? `, scadentă la ${dueStr}` : ''}, în valoare de ${amountStr}, nu a fost încasată. Ai drept de replică în această sesizare; răspunde cu dovada plății sau o explicație.`,
      claimedAmount: remaining,
      currency: inv.currency,
      isPublic: false,
      status: 'open',
    });

    // Notify the client company's users — gives them the response window.
    const targets = await db.select({ id: users.id }).from(users).where(eq(users.companyId, inv.clientCompanyId));
    for (const t of targets) {
      try {
        await notify({
          userId: t.id,
          type: 'incident',
          title: `Sesizare de neplată: factura ${inv.fullNumber}`,
          body: `${issuerName} a deschis o sesizare de neîncasare (${amountStr}). Ai drept de replică.`,
          linkUrl: `/app`,
          entityType: 'incident',
          entityId: incidentId,
        });
      } catch { /* notification best-effort */ }
    }
  }

  // A confirmed payment incident hurts the client's Payment Reliability Score.
  if (inv.clientCompanyId && inv.clientCompanyId !== cid) {
    recomputeCompanyPaymentScore(inv.clientCompanyId).catch(() => {});
  }

  await logAction({ userId: locals.user.id, companyId: cid, action: 'invoice.dispute', entityType: 'invoice', entityId: inv.id, request });

  return new Response(JSON.stringify({ ok: true, disputed: true, incidentId }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
