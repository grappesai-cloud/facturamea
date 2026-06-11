// e-Transport API — UIT (cod unic transport) declarations for cargo
// movements that are international or fall under fiscal-risk categories.
//
// Endpoints (test/prod swap via ANAF_API_MODE):
//   POST /etransport/upload/{cif}                  — declare new UIT
//   GET  /etransport/stareMesaj/{id_incarcare}     — submission status
//   GET  /etransport/descarcare/{id_incarcare}     — download response
//   GET  /etransport/lista/{cif}                   — recent declarations
//
// Reference: https://mfinante.gov.ro/web/efactura/informatii-tehnice (e-Transport section)
import { apiBase } from './config';
import { getValidAccessToken } from './tokens';
import { db, anafSubmissions } from '../../db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface ETransportDeclaration {
  // Required core fields per ANAF e-Transport schema. We accept a
  // pre-built XML body to avoid coupling this module to the platform's
  // internal order shape — buildEtransportXml() lives in the call-site.
  xml: string;
  cif: string;            // declarant CIF (no RO prefix)
  refType?: 'order';
  refId?: string;
  userId: string;
}

async function authedRequest(companyId: string, path: string, init: RequestInit): Promise<Response> {
  const token = await getValidAccessToken(companyId, 'e-transport');
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
}

export async function declareUit(companyId: string, opts: ETransportDeclaration): Promise<{
  ok: boolean;
  uit?: string;
  spvIndex?: string;
  error?: string;
  submissionId: string;
}> {
  const submissionId = nanoid();
  await db.insert(anafSubmissions).values({
    id: submissionId,
    companyId,
    scope: 'e-transport',
    action: 'declare-uit',
    refType: opts.refType ?? null,
    refId: opts.refId ?? null,
    status: 'pending',
    payload: { xml: opts.xml.slice(0, 4000) },
    createdByUserId: opts.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  let res: Response;
  try {
    res = await authedRequest(companyId, `/etransport/upload/${encodeURIComponent(opts.cif)}`, {
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

  // ANAF returns XML with index_incarcare="..." and uit="..." attributes.
  const idx = text.match(/index_incarcare\s*=\s*"([^"]+)"/)?.[1];
  const uit = text.match(/\b(uit|UIT)\s*=\s*"([^"]+)"/)?.[2];

  await db.update(anafSubmissions).set({
    status: 'sent',
    spvIndex: idx ?? null,
    uit: uit ?? null,
    response: { status: res.status, body: text.slice(0, 4000) },
    updatedAt: new Date(),
  }).where(eq(anafSubmissions.id, submissionId));

  return { ok: true, uit, spvIndex: idx, submissionId };
}

export async function getStatus(companyId: string, spvIndex: string): Promise<{ ok: boolean; raw?: string; error?: string }> {
  try {
    const res = await authedRequest(companyId, `/etransport/stareMesaj/${encodeURIComponent(spvIndex)}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    return { ok: true, raw: text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}

export async function listRecent(companyId: string, cif: string, days: number = 60): Promise<{ ok: boolean; raw?: string; error?: string }> {
  try {
    const res = await authedRequest(companyId, `/etransport/lista/${encodeURIComponent(cif)}?zile=${days}`, { method: 'GET' });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
    return { ok: true, raw: text };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}

// Build a minimal e-Transport XML declaration. ANAF accepts the schema
// from https://mfinante.gov.ro/static/10/Mfp/eTransport/. This is the
// 2024 v2 schema (etransport.xsd). Caller is responsible for valid
// data — ANAF returns descriptive errors if fields are missing.
export interface EtransportXmlInput {
  declarant: { cif: string; name: string; }; // organizator transport
  vehicle: { plateNumber: string; trailerPlate?: string; };
  driver: { firstName: string; lastName: string; cnp?: string; };
  loading: { country: string; postalCode?: string; locality: string; street: string; date: string }; // YYYY-MM-DD
  unloading: { country: string; postalCode?: string; locality: string; street: string; date: string };
  goods: Array<{
    nomenclatureCode: string; // CN code 8 cifre
    description: string;
    grossWeightKg: number;
    netWeightKg?: number;
    quantity: number;
    unit: string;             // e.g. 'KGM', 'NAR'
    valueRon?: number;
  }>;
  operationType: number;       // 10..50 per ANAF nomenclature (10 = AIC import, 30 = AIC export, etc.)
}

const xe = (s: string) => String(s).replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]!));

export function buildEtransportXml(d: EtransportXmlInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eTransport xmlns="mfp:anaf:dgti:eTransport:declaratie:v2" codDeclaratie="${d.operationType}">
  <Declarant cif="${xe(d.declarant.cif)}" denumire="${xe(d.declarant.name)}"/>
  <DateTransport dataTransport="${xe(d.loading.date)}">
    <CodTaraExpeditor>${xe(d.loading.country.slice(0,2).toUpperCase())}</CodTaraExpeditor>
    <CodTaraDestinatar>${xe(d.unloading.country.slice(0,2).toUpperCase())}</CodTaraDestinatar>
    <Vehicul nrVehicul="${xe(d.vehicle.plateNumber)}"${d.vehicle.trailerPlate ? ` nrRemorca1="${xe(d.vehicle.trailerPlate)}"` : ''}/>
    <Conducator nume="${xe(d.driver.lastName)}" prenume="${xe(d.driver.firstName)}"${d.driver.cnp ? ` codIdentificare="${xe(d.driver.cnp)}"` : ''}/>
  </DateTransport>
  <LocIncarcare codTara="${xe(d.loading.country.slice(0,2).toUpperCase())}" codPostal="${xe(d.loading.postalCode || '')}" localitate="${xe(d.loading.locality)}" strada="${xe(d.loading.street)}"/>
  <LocDescarcare codTara="${xe(d.unloading.country.slice(0,2).toUpperCase())}" codPostal="${xe(d.unloading.postalCode || '')}" localitate="${xe(d.unloading.locality)}" strada="${xe(d.unloading.street)}"/>
  ${d.goods.map((g, i) => `<BunuriTransportate nrCrt="${i + 1}" codNc="${xe(g.nomenclatureCode)}" denumire="${xe(g.description)}" cantitate="${g.quantity}" codUnitateMasura="${xe(g.unit)}" greutateBruta="${g.grossWeightKg}"${g.netWeightKg != null ? ` greutateNeta="${g.netWeightKg}"` : ''}${g.valueRon != null ? ` valoareLeiFaraTva="${g.valueRon}"` : ''}/>`).join('\n  ')}
</eTransport>`;
}
