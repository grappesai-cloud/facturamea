// e-Factura RO — generator UBL 2.1 XML compatibil cu ANAF SPV.
// Schema: https://efactura.mfinante.gov.ro/static/eFactura.html
//
// MVP: produce un Invoice XML valid; trimiterea către SPV (POST upload
// la api.anaf.ro) necesită OAuth (acelaşi token ca ANAF lookup) — la
// trimiterea reală pasezi XML-ul în lib/efactura-submit (separat).

interface Party {
  name: string;
  cui: string;              // fără prefix RO
  vatPayer: boolean;        // dacă e plătitor TVA → fiscal ID e RO + cui
  registrationNumber?: string; // J40/...
  address: { street: string; city: string; postalCode?: string; country: string };
  contact?: { phone?: string; email?: string };
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unit: string;             // 'XPP' (pieces), 'KGM' (kg), 'C62' (one)
  unitPriceCents: number;   // RON cents
  vatPercent: number;       // 19, 9, 5, 0
}

export interface InvoiceInput {
  invoiceNumber: string;
  issueDate: string;        // YYYY-MM-DD
  dueDate: string;          // YYYY-MM-DD
  currency: string;         // 'RON' typically
  supplier: Party;
  customer: Party;
  lines: InvoiceLine[];
  notes?: string;
}

const xmlEscape = (s: string) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

function partyXml(party: Party, role: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
  const fiscalId = party.vatPayer ? `RO${party.cui}` : party.cui;
  return `
  <cac:${role}>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(party.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(party.address.street)}</cbc:StreetName>
        <cbc:CityName>${xmlEscape(party.address.city)}</cbc:CityName>
        ${party.address.postalCode ? `<cbc:PostalZone>${xmlEscape(party.address.postalCode)}</cbc:PostalZone>` : ''}
        <cac:Country><cbc:IdentificationCode>${xmlEscape(party.address.country.slice(0, 2).toUpperCase())}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${party.vatPayer ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>RO${xmlEscape(party.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(party.name)}</cbc:RegistrationName>
        <cbc:CompanyID>${xmlEscape(fiscalId)}</cbc:CompanyID>
        ${party.registrationNumber ? `<cbc:CompanyLegalForm>${xmlEscape(party.registrationNumber)}</cbc:CompanyLegalForm>` : ''}
      </cac:PartyLegalEntity>
      ${party.contact ? `<cac:Contact>
        ${party.contact.phone ? `<cbc:Telephone>${xmlEscape(party.contact.phone)}</cbc:Telephone>` : ''}
        ${party.contact.email ? `<cbc:ElectronicMail>${xmlEscape(party.contact.email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>` : ''}
    </cac:Party>
  </cac:${role}>`;
}

export function generateEFacturaXml(input: InvoiceInput): string {
  // Compute totals
  let netTotalCents = 0;
  let vatTotalCents = 0;
  const linesXml = input.lines.map((line, i) => {
    const lineNetCents = Math.round(line.quantity * line.unitPriceCents);
    const lineVatCents = Math.round(lineNetCents * (line.vatPercent / 100));
    netTotalCents += lineNetCents;
    vatTotalCents += lineVatCents;
    return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${line.unit}">${line.quantity.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${(lineNetCents / 100).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${line.vatPercent > 0 ? 'S' : 'Z'}</cbc:ID>
        <cbc:Percent>${line.vatPercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${input.currency}">${(line.unitPriceCents / 100).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }).join('');

  const totalCents = netTotalCents + vatTotalCents;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
  <cbc:ID>${xmlEscape(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${input.issueDate}</cbc:IssueDate>
  <cbc:DueDate>${input.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${input.notes ? `<cbc:Note>${xmlEscape(input.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${input.currency}</cbc:DocumentCurrencyCode>
  ${partyXml(input.supplier, 'AccountingSupplierParty')}
  ${partyXml(input.customer, 'AccountingCustomerParty')}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${input.currency}">${(vatTotalCents / 100).toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${input.currency}">${(netTotalCents / 100).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${input.currency}">${(netTotalCents / 100).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${input.currency}">${(totalCents / 100).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${input.currency}">${(totalCents / 100).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>`;
}

// Submit XML to ANAF SPV. Requires ANAF_OAUTH_TOKEN (same one used for
// VAT lookup). Returns submission status.
export async function submitToSpv(xml: string): Promise<{ ok: boolean; spvId?: string; error?: string }> {
  const token = process.env.ANAF_OAUTH_TOKEN;
  if (!token) return { ok: false, error: 'ANAF_OAUTH_TOKEN nu este setat — XML generat dar nu trimis' };

  try {
    const res = await fetch('https://api.anaf.ro/test/FCTEL/rest/upload?standard=UBL&cif=', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': `Bearer ${token}`,
      },
      body: xml,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, error: `SPV a răspuns ${res.status}: ${await res.text()}` };
    }
    const respText = await res.text();
    // ANAF returns XML with <header index_incarcare="..."/>
    const m = respText.match(/index_incarcare\s*=\s*"([^"]+)"/);
    return { ok: true, spvId: m?.[1] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'eroare reţea' };
  }
}
