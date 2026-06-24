import type { APIRoute } from 'astro';
import { db } from '../../../../../db';
import { transportInvoices, invoiceClients, users } from '../../../../../db/schema';
import { and, eq } from 'drizzle-orm';
import { sendEmail, notify } from '../../../../../lib/notifications';
import { requireRole } from '../../../../../lib/require-role';

// Escape user-controlled values before interpolating into the email HTML.
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Mark the invoice as `sent` and email a link to the recipient. We don't
// attach the PDF (PDF generation is rendered as a print view); we send a
// public-tokenless link inside the platform — recipient must be on TH or
// receive the doc via in-app messaging in a future iteration.
export const POST: APIRoute = async ({ params, locals, request }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  const denied = requireRole(locals, 'invoice.create');
  if (denied) return denied;
  const cid = locals.user.companyId;
  const invoiceId = params.id as string;
  if (!cid || !invoiceId) return new Response(JSON.stringify({ error: 'Date lipsă' }), { status: 400 });

  const body = await request.json().catch(() => ({}));
  const overrideEmail = body.email?.trim() || null;

  const [inv] = await db.select().from(transportInvoices).where(and(eq(transportInvoices.id, invoiceId), eq(transportInvoices.companyId, cid))).limit(1);
  if (!inv) return new Response(JSON.stringify({ error: 'Factură inexistentă' }), { status: 404 });

  let recipient = overrideEmail;
  if (!recipient && inv.clientExternalId) {
    const [c] = await db.select({ email: invoiceClients.email }).from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId)).limit(1);
    recipient = c?.email || null;
  }
  if (!recipient) return new Response(JSON.stringify({ error: 'Niciun email pentru destinatar' }), { status: 400 });

  try {
    const subject = `${inv.kind === 'proforma' ? 'Proformă' : inv.kind === 'storno' ? 'Factură storno' : inv.kind === 'chitanta' ? 'Chitanță' : 'Factură'} ${inv.fullNumber}`;
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://facturamea.com';
    const pdfLink = `${baseUrl}/api/invoicing/invoices/${inv.id}/pdf`;
    const text = `Documentul ${inv.fullNumber} în valoare de ${(inv.totalCents / 100).toFixed(2)} ${inv.currency}. Descarcă PDF: ${pdfLink}`;
    const html = `<p>Bună ziua,</p><p>Vă transmitem documentul <strong>${esc(inv.fullNumber)}</strong> în valoare de <strong>${(inv.totalCents / 100).toFixed(2)} ${esc(inv.currency)}</strong>.</p><p><a href="${pdfLink}">Descarcă PDF</a> sau <a href="${baseUrl}/app/facturare/${inv.id}">vezi în platformă</a></p><p>Mulțumim,<br/>${esc(locals.user.name || 'facturamea')}</p>`;
    await sendEmail(recipient, subject, text, html);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Eroare trimitere email' }), { status: 502 });
  }

  // Only advance draft/issued → sent. Never clobber paid/partial/reversed/voided/
  // overdue (it corrupts receivables + fiscal-period reporting); just record sentAt.
  const sentStatus = (inv.status === 'draft' || inv.status === 'issued') ? 'sent' : inv.status;
  await db.update(transportInvoices).set({ status: sentStatus, sentAt: new Date(), updatedAt: new Date() }).where(eq(transportInvoices.id, invoiceId));

  // In-app notification when the recipient is a TH-registered company — so the
  // document also lands inside the platform, not only in their inbox.
  if (inv.clientCompanyId && inv.clientCompanyId !== cid) {
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://facturamea.com';
    const targets = await db.select({ id: users.id }).from(users).where(eq(users.companyId, inv.clientCompanyId));
    for (const tgt of targets) {
      try {
        await notify({
          userId: tgt.id,
          type: 'invoice',
          title: `Ai primit ${inv.kind === 'proforma' ? 'o proformă' : 'o factură'}: ${inv.fullNumber}`,
          body: `${(inv.totalCents / 100).toFixed(2)} ${inv.currency} de la ${locals.user.name || 'un partener'}.`,
          linkUrl: `${baseUrl}/app/facturare/${inv.id}`,
          entityType: 'invoice',
          entityId: inv.id,
        });
      } catch { /* best-effort */ }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
