// e-Factura SPV API client. The XML generation lives in lib/efactura.ts
// (UBL 2.1) — this module owns the network calls + per-company OAuth.
//
// Endpoints (test/prod swap via ANAF_API_MODE):
//   POST /FCTEL/rest/upload?standard=UBL&cif={cif}
//   GET  /FCTEL/rest/stareMesaj?id_incarcare={id}
//   GET  /FCTEL/rest/listaMesajeFactura?zile=60&cif={cif}
//   GET  /FCTEL/rest/descarcare?id={id}
import { apiBase } from './config';
import { getValidAccessToken } from './tokens';
import { db, anafSubmissions } from '../../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

async function authed(companyId: string, path: string, init: RequestInit): Promise<Response> {
  const token = await getValidAccessToken(companyId, 'e-factura');
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function uploadInvoice(opts: {
  companyId: string;
  cif: string;
  xml: string;
  refId?: string;
  userId: string;
}): Promise<{ ok: boolean; spvIndex?: string; error?: string; submissionId: string }> {
  const submissionId = nanoid();
  await db.insert(anafSubmissions).values({
    id: submissionId,
    companyId: opts.companyId,
    scope: 'e-factura',
    action: 'upload-invoice',
    refType: 'invoice',
    refId: opts.refId ?? null,
    status: 'pending',
    payload: { xmlPreview: opts.xml.slice(0, 1000) },
    createdByUserId: opts.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let res: Response;
  try {
    res = await authed(opts.companyId, `/FCTEL/rest/upload?standard=UBL&cif=${encodeURIComponent(opts.cif)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: opts.xml,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'eroare reţea';
    await db.update(anafSubmissions).set({ status: 'error', errorMessage: msg, updatedAt: new Date() }).where(eq(anafSubmissions.id, submissionId));
    return { ok: false, error: msg, submissionId };
  }

  const text = await res.text();
  if (!res.ok) {
    await db.update(anafSubmissions).set({
      status: 'rejected',
      errorMessage: `${res.status}: ${text.slice(0, 500)}`,
      response: { status: res.status, body: text.slice(0, 4000) },
      updatedAt: new Date(),
    }).where(eq(anafSubmissions.id, submissionId));
    return { ok: false, error: `ANAF ${res.status}: ${text.slice(0, 200)}`, submissionId };
  }

  const spvIndex = text.match(/index_incarcare\s*=\s*"([^"]+)"/)?.[1];
  await db.update(anafSubmissions).set({
    status: 'sent',
    spvIndex: spvIndex ?? null,
    response: { body: text.slice(0, 4000) },
    updatedAt: new Date(),
  }).where(eq(anafSubmissions.id, submissionId));

  return { ok: true, spvIndex, submissionId };
}

export async function listMessages(companyId: string, cif: string, days = 60): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await authed(companyId, `/FCTEL/rest/listaMesajeFactura?zile=${days}&cif=${encodeURIComponent(cif)}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    try { return { ok: true, data: JSON.parse(text) }; }
    catch { return { ok: true, data: { raw: text } }; }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}

export async function downloadMessage(companyId: string, id: string): Promise<{ ok: boolean; bytes?: ArrayBuffer; contentType?: string; error?: string }> {
  try {
    const res = await authed(companyId, `/FCTEL/rest/descarcare?id=${encodeURIComponent(id)}`, { method: 'GET' });
    if (!res.ok) return { ok: false, error: `${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, bytes: await res.arrayBuffer(), contentType: res.headers.get('content-type') || 'application/zip' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}

export async function getSubmissionStatus(companyId: string, spvIndex: string): Promise<{ ok: boolean; raw?: string; error?: string }> {
  try {
    const res = await authed(companyId, `/FCTEL/rest/stareMesaj?id_incarcare=${encodeURIComponent(spvIndex)}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    return { ok: true, raw: text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}
