// FREE e-Factura (UBL 2.1 / CIUS-RO) invoice parser — zero AI, deterministic,
// 100% accurate. For B2B invoices (mandatory e-Factura in RO) this fully
// replaces OCR: the structured XML already contains supplier, CUI, number,
// date, net/VAT/total and lines. OCR (paid) is only needed for paper receipts.
//
// Security: fast-xml-parser does not resolve external/DTD entities (no XXE);
// we additionally reject any DOCTYPE/ENTITY declaration as defense-in-depth.
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

export interface ParsedInvoiceFields {
  supplierName: string | null;
  supplierCui: string | null;
  documentNumber: string | null;
  issueDate: string | null; // YYYY-MM-DD
  netCents: number;
  vatCents: number;
  totalCents: number;
  currency: string;
  category: string | null; // UBL has no expense category — left null (parity with OCR)
  lineCount: number;
}

export type ParseResult =
  | { ok: true; kind: 'invoice' | 'creditnote'; fields: ParsedInvoiceFields }
  | { ok: false; error: string };

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') v = (v as any)['#text'] ?? null;
  const s = String(v).trim();
  return s || null;
}

function toCents(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Pull the invoice XML out of an upload: either a raw .xml or the ZIP that
 *  ANAF SPV hands you (which bundles the invoice XML + a signature XML). */
export function extractInvoiceXml(bytes: Uint8Array): string | null {
  // ZIP magic "PK\x03\x04"
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const files = unzipSync(bytes);
      const xmlNames = Object.keys(files).filter((n) => /\.xml$/i.test(n));
      // ANAF zip = <id>.xml (invoice) + semnatura_<id>.xml (signature). Skip the signature.
      const invName = xmlNames.find((n) => !/sem|sign/i.test(n)) || xmlNames[0];
      if (!invName) return null;
      return new TextDecoder().decode(files[invName]);
    } catch {
      return null;
    }
  }
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Parse a CIUS-RO UBL Invoice/CreditNote into expense fields. Never throws. */
export function parseEfacturaXml(xml: string): ParseResult {
  if (!xml || xml.length > 5_000_000) return { ok: false, error: 'XML lipsă sau prea mare.' };
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { ok: false, error: 'XML respins (DOCTYPE/ENTITY interzis).' };

  let doc: any;
  try {
    const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: true, trimValues: true });
    doc = parser.parse(xml);
  } catch {
    return { ok: false, error: 'Nu am putut citi XML-ul.' };
  }

  const root = doc?.Invoice ?? doc?.CreditNote;
  if (!root) return { ok: false, error: 'Fișierul nu pare o factură e-Factura (UBL).' };
  const kind: 'invoice' | 'creditnote' = doc?.CreditNote ? 'creditnote' : 'invoice';

  const party = root?.AccountingSupplierParty?.Party ?? {};
  const legal = party?.PartyLegalEntity ?? {};
  const taxScheme = Array.isArray(party?.PartyTaxScheme) ? party.PartyTaxScheme[0] : party?.PartyTaxScheme;

  const supplierName = txt(legal?.RegistrationName) ?? txt(party?.PartyName?.Name) ?? null;
  const supplierCui = txt(taxScheme?.CompanyID) ?? txt(legal?.CompanyID) ?? null;
  const documentNumber = txt(root?.ID);
  const issueRaw = txt(root?.IssueDate);
  const issueDate = issueRaw && /^\d{4}-\d{2}-\d{2}/.test(issueRaw) ? issueRaw.slice(0, 10) : null;
  const currency = (txt(root?.DocumentCurrencyCode) ?? 'RON').toUpperCase().slice(0, 5);

  const lmt = root?.LegalMonetaryTotal ?? {};
  const netCents = toCents(txt(lmt?.TaxExclusiveAmount));
  let vatCents = 0;
  const taxTotals = Array.isArray(root?.TaxTotal) ? root.TaxTotal : root?.TaxTotal ? [root.TaxTotal] : [];
  for (const t of taxTotals) vatCents += toCents(txt(t?.TaxAmount));
  let totalCents = toCents(txt(lmt?.TaxInclusiveAmount)) || toCents(txt(lmt?.PayableAmount));
  if (totalCents === 0 && (netCents > 0 || vatCents > 0)) totalCents = netCents + vatCents;

  const rawLines = kind === 'creditnote' ? root?.CreditNoteLine : root?.InvoiceLine;
  const lineCount = Array.isArray(rawLines) ? rawLines.length : rawLines ? 1 : 0;

  if (!documentNumber && totalCents === 0) {
    return { ok: false, error: 'XML-ul nu conține datele unei facturi valide.' };
  }

  return {
    ok: true,
    kind,
    fields: { supplierName, supplierCui, documentNumber, issueDate, netCents, vatCents, totalCents, currency, category: null, lineCount },
  };
}
