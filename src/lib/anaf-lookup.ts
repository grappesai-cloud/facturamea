// ANAF — Public VAT-payer lookup (no OAuth required).
//
// Endpoint: https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva
// (ANAF restructured the URL — old /PlatitorTvaRest/api/v9/ws/tva returns 404.)
// Free, anonymous, rate-limited (~1 req/s, 500 CUIs per request).
//
// Schema: POST [{ cui: <number>, data: "YYYY-MM-DD" }] → { found: [...], notFound: [...] }
//
// Override endpoint via ANAF_WS_URL.

const DEFAULT_ENDPOINT = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

export interface AnafResult {
  ok: true;
  cui: string;
  isActive: boolean;          // company exists and is registered
  isInactive: boolean;        // marked as fiscally inactive
  isVatPayer: boolean;        // current VAT payer
  vatPayerSince?: string;     // ISO date of latest VAT registration period start
  splitVat: boolean;          // split-VAT regime
  name: string;
  address: string;
  tradeRegisterNumber?: string;
  phone?: string;
  registrationDate?: string;  // ISO date of company registration
  registrationStatus?: string;// raw "INREGISTRAT din data ..." string
  raw: unknown;               // full response for inspection
  source: 'anaf';
  checkedAt: string;
}

export interface AnafError {
  ok: false;
  error: string;
  source: 'anaf';
  checkedAt: string;
}

export async function lookupAnaf(cuiInput: string | number): Promise<AnafResult | AnafError> {
  const checkedAt = new Date().toISOString();
  const cui = String(cuiInput).replace(/^RO/i, '').replace(/\D/g, '');
  if (!cui || cui.length < 2 || cui.length > 10) {
    return { ok: false, error: 'CUI invalid', source: 'anaf', checkedAt };
  }

  const endpoint = (typeof process !== 'undefined' && process.env?.ANAF_WS_URL) || DEFAULT_ENDPOINT;
  const today = new Date().toISOString().slice(0, 10);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify([{ cui: Number(cui), data: today }]),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Eroare reţea ANAF';
    return { ok: false, error: msg, source: 'anaf', checkedAt };
  }

  if (res.status === 429) {
    return { ok: false, error: 'ANAF rate-limited (1 req/s). Reîncearcă în câteva secunde.', source: 'anaf', checkedAt };
  }
  if (!res.ok) {
    return { ok: false, error: `ANAF a răspuns ${res.status}`, source: 'anaf', checkedAt };
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Răspuns ANAF invalid', source: 'anaf', checkedAt };
  }

  const found = Array.isArray(data?.found) ? data.found[0] : null;
  if (!found) {
    const notFound = Array.isArray(data?.notFound) && data.notFound.length > 0;
    return { ok: false, error: notFound ? 'CUI inexistent în registrul ANAF' : 'Nicio înregistrare găsită', source: 'anaf', checkedAt };
  }

  const general = found.date_generale || {};
  const tvaInfo = found.inregistrare_scop_Tva || {};
  const inactiveInfo = found.stare_inactiv || {};
  const splitInfo = found.inregistrare_SplitTVA || {};

  // The most recent VAT registration period start (last item is current)
  const tvaPeriods: any[] = Array.isArray(tvaInfo.perioade_TVA) ? tvaInfo.perioade_TVA : [];
  const lastPeriod = tvaPeriods[tvaPeriods.length - 1] || null;

  return {
    ok: true,
    cui,
    isActive: Boolean(general.cui),
    isInactive: Boolean(inactiveInfo.statusInactivi),
    isVatPayer: Boolean(tvaInfo.scpTVA),
    vatPayerSince: lastPeriod?.data_inceput_ScpTVA,
    splitVat: Boolean(splitInfo.statusSplitTVA),
    name: general.denumire || '',
    address: general.adresa || '',
    tradeRegisterNumber: general.nrRegCom || undefined,
    phone: general.telefon || undefined,
    registrationDate: general.data_inregistrare || undefined,
    registrationStatus: general.stare_inregistrare || undefined,
    raw: found,
    source: 'anaf',
    checkedAt,
  };
}
