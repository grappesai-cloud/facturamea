// e-Factura RO — generator UBL 2.1 XML compatibil cu ANAF SPV / CIUS-RO.
// Schema: https://efactura.mfinante.gov.ro/static/eFactura.html
// Profil: EN16931 + CIUS-RO 1.0.1. XML-ul rezultat e trimis către SPV de
// lib/anaf/efactura-client.ts (uploadInvoice). Acest modul produce DOAR XML-ul.
//
// Conformitate validată față de regulile pe care le impune validatorul ANAF:
//  - BT-10 BuyerReference obligatoriu (BR-CO-... / CIUS-RO)
//  - BG-23 defalcare TVA (cac:TaxSubtotal) pe categorie+cotă
//  - Motiv de scutire (TaxExemptionReason[Code]) la categoriile fără TVA
//  - Pentru valută != RON: TaxCurrencyCode=RON + TVA în RON (BT-111) + curs
//  - Nr. reg. comerț în BT-30/BT-47 (PartyLegalEntity/CompanyID), nu CompanyLegalForm

// Categorii TVA EN16931 (UNCL5305): S=standard, Z=cotă zero, E=scutit,
// AE=taxare inversă, K=livrare intracomunitară, G=export, O=neimpozabil.
type VatCategory = 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O';

// Categoriile fără TVA care necesită un motiv de scutire în defalcare.
const EXEMPTION: Record<string, { code?: string; reason: string }> = {
  AE: { code: 'VATEX-EU-AE', reason: 'Taxare inversă' },
  K: { code: 'VATEX-EU-IC', reason: 'Livrare intracomunitară de bunuri, scutită cu drept de deducere' },
  G: { code: 'VATEX-EU-G', reason: 'Export de bunuri în afara UE' },
  E: { reason: 'Scutit de TVA' },
  O: { reason: 'Neimpozabil în România' },
};

interface Party {
  name: string;
  cui: string; // fără prefix RO
  vatPayer: boolean; // plătitor TVA → fiscal ID = RO + cui
  registrationNumber?: string; // J40/.../2020 (nr. reg. comerț)
  address: { street: string; city: string; postalCode?: string; country: string };
  contact?: { phone?: string; email?: string };
}

interface InvoiceLine {
  description: string;
  quantity: number;
  unit: string; // 'XPP' (bucăți), 'KGM' (kg), 'C62' (one), 'H87'...
  unitPriceCents: number; // RON cents
  vatPercent: number; // 21, 19, 9, 5, 0
  vatCategory?: VatCategory; // implicit: S dacă percent>0, altfel Z
  exemptionReason?: string; // text scutire (suprascrie default-ul categoriei)
}

export interface InvoiceInput {
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  currency: string; // 'RON' de regulă
  supplier: Party;
  customer: Party;
  lines: InvoiceLine[];
  notes?: string;
  buyerReference?: string; // BT-10; implicit = invoiceNumber
  exchangeRate?: number; // RON per 1 unitate de valută; necesar dacă currency != RON
}

const xmlEscape = (s: string) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );

const money = (cents: number) => (cents / 100).toFixed(2);

function partyXml(party: Party, role: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
  const legalId = party.registrationNumber || (party.vatPayer ? `RO${party.cui}` : party.cui);
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
      ${
        party.vatPayer
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>RO${xmlEscape(party.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(party.name)}</cbc:RegistrationName>
        <cbc:CompanyID>${xmlEscape(legalId)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      ${
        party.contact
          ? `<cac:Contact>
        ${party.contact.phone ? `<cbc:Telephone>${xmlEscape(party.contact.phone)}</cbc:Telephone>` : ''}
        ${party.contact.email ? `<cbc:ElectronicMail>${xmlEscape(party.contact.email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>`
          : ''
      }
    </cac:Party>
  </cac:${role}>`;
}

function taxCategoryXml(cat: VatCategory, percent: number, exemptionText?: string): string {
  const ex = EXEMPTION[cat];
  const reason = exemptionText || ex?.reason;
  return `<cac:TaxCategory>
        <cbc:ID>${cat}</cbc:ID>
        <cbc:Percent>${percent.toFixed(2)}</cbc:Percent>
        ${ex?.code ? `<cbc:TaxExemptionReasonCode>${ex.code}</cbc:TaxExemptionReasonCode>` : ''}
        ${ex && reason ? `<cbc:TaxExemptionReason>${xmlEscape(reason)}</cbc:TaxExemptionReason>` : ''}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>`;
}

export function generateEFacturaXml(input: InvoiceInput): string {
  const cur = input.currency || 'RON';
  const isForeign = cur.toUpperCase() !== 'RON';
  const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1;

  // Grupăm liniile pe (categorie, cotă) pentru defalcarea TVA (BG-23).
  // VAT pe categorie se calculează din baza totală a grupului (BR-S-09),
  // nu prin însumarea TVA pe linie — ca să respecte regulile de rotunjire.
  interface Group {
    cat: VatCategory;
    percent: number;
    netCents: number;
    exemptionText?: string;
  }
  const groups = new Map<string, Group>();
  let netTotalCents = 0;

  const linesXml = input.lines
    .map((line, i) => {
      const lineNetCents = Math.round(line.quantity * line.unitPriceCents);
      netTotalCents += lineNetCents;
      const cat: VatCategory = line.vatCategory ?? (line.vatPercent > 0 ? 'S' : 'Z');
      const percent = cat === 'S' || cat === 'Z' ? line.vatPercent : 0;
      const key = `${cat}|${percent}`;
      const g = groups.get(key);
      if (g) g.netCents += lineNetCents;
      else groups.set(key, { cat, percent, netCents: lineNetCents, exemptionText: line.exemptionReason });

      return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${xmlEscape(line.unit)}">${line.quantity.toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${money(lineNetCents)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat}</cbc:ID>
        <cbc:Percent>${percent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${cur}">${money(line.unitPriceCents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('');

  // Defalcarea TVA + total TVA.
  let vatTotalCents = 0;
  const subtotalsXml = Array.from(groups.values())
    .map((g) => {
      const groupVatCents = Math.round((g.netCents * g.percent) / 100);
      vatTotalCents += groupVatCents;
      return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${money(g.netCents)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${money(groupVatCents)}</cbc:TaxAmount>
      ${taxCategoryXml(g.cat, g.percent, g.exemptionText)}
    </cac:TaxSubtotal>`;
    })
    .join('');

  const totalCents = netTotalCents + vatTotalCents;

  // Pentru valută străină: cursul + TVA exprimată în RON (BT-111).
  const vatTotalRon = ((vatTotalCents / 100) * rate).toFixed(2);
  const exchangeXml = isForeign
    ? `
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${cur}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>RON</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${rate.toFixed(4)}</cbc:CalculationRate>
  </cac:TaxExchangeRate>`
    : '';
  const ronTaxTotalXml = isForeign
    ? `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="RON">${vatTotalRon}</cbc:TaxAmount>
  </cac:TaxTotal>`
    : '';

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
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  ${isForeign ? '<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>' : ''}
  <cbc:BuyerReference>${xmlEscape(input.buyerReference || input.invoiceNumber)}</cbc:BuyerReference>
  ${partyXml(input.supplier, 'AccountingSupplierParty')}
  ${partyXml(input.customer, 'AccountingCustomerParty')}${exchangeXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${money(vatTotalCents)}</cbc:TaxAmount>${subtotalsXml}
  </cac:TaxTotal>${ronTaxTotalXml}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${money(netTotalCents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${money(netTotalCents)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${money(totalCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${money(totalCents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>`;
}
