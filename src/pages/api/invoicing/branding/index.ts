// /api/invoicing/branding — get + save per-company invoicing settings:
// logo + stamp + signature URLs, footer text, TVA-la-încasare toggle.
// Upload files first via /api/upload/document (purpose=image|document),
// then POST the returned URLs here.

import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { companies } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '../../../../lib/require-role';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  const [c] = await db.select({
    invoiceLogoUrl: companies.invoiceLogoUrl,
    invoiceStampUrl: companies.invoiceStampUrl,
    invoiceSignatureUrl: companies.invoiceSignatureUrl,
    invoiceFooterText: companies.invoiceFooterText,
    tvaAtCollection: companies.tvaAtCollection,
  }).from(companies).where(eq(companies.id, locals.user.companyId));
  return new Response(JSON.stringify(c || {}), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.companyId) return new Response(JSON.stringify({ error: 'Neautentificat' }), { status: 401 });
  { const denied = requireRole(locals, 'settings.manage'); if (denied) return denied; }
  const body = await request.json().catch(() => ({})) as any;

  const patch: any = { updatedAt: new Date() };
  if (body.invoiceLogoUrl !== undefined) patch.invoiceLogoUrl = body.invoiceLogoUrl || null;
  if (body.invoiceStampUrl !== undefined) patch.invoiceStampUrl = body.invoiceStampUrl || null;
  if (body.invoiceSignatureUrl !== undefined) patch.invoiceSignatureUrl = body.invoiceSignatureUrl || null;
  if (body.invoiceFooterText !== undefined) patch.invoiceFooterText = body.invoiceFooterText?.trim() || null;
  if (body.tvaAtCollection !== undefined) patch.tvaAtCollection = !!body.tvaAtCollection;

  await db.update(companies).set(patch).where(eq(companies.id, locals.user.companyId));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
