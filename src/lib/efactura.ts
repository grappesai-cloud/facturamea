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

// BR-CL-23: unitatea de măsură trebuie să fie cod UN/ECE Rec 20/21, nu text liber.
// Mapăm denumirile RO uzuale; fallback la C62 (one). „buc" => H87 (piece).
function mapUnitCode(unit: string): string {
  const u = (unit || '').trim().toLowerCase().replace(/\./g, '').replace(/[ăâ]/g, 'a').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/î/g, 'i');
  // Deja un cod UN/ECE valid (litere mari 1-3 caractere) — păstrează-l.
  if (/^[A-Z][A-Z0-9]{1,2}$/.test(unit.trim())) return unit.trim();
  const map: Record<string, string> = {
    buc: 'H87', bucata: 'H87', bucati: 'H87', bc: 'H87',
    ora: 'HUR', ore: 'HUR', h: 'HUR',
    zi: 'DAY', zile: 'DAY',
    luna: 'MON', luni: 'MON',
    an: 'ANN', ani: 'ANN',
    kg: 'KGM', g: 'GRM', gr: 'GRM', to: 'TNE', tona: 'TNE', tone: 'TNE',
    l: 'LTR', litru: 'LTR', litri: 'LTR', ml: 'MLT',
    m: 'MTR', metru: 'MTR', metri: 'MTR', km: 'KMT', cm: 'CMT', mm: 'MMT',
    mp: 'MTK', m2: 'MTK', mc: 'MTQ', m3: 'MTQ',
    set: 'SET', pereche: 'NPR', pachet: 'XPK', cutie: 'XBX', rola: 'XRO',
    serviciu: 'C62', servicii: 'C62', abonament: 'C62', proiect: 'C62', unitate: 'C62',
  };
  return map[u] || 'C62';
}

// BR-RO-110: dacă țara = RO, subdiviziunea (județul) trebuie cod ISO 3166-2:RO.
const RO_COUNTIES: Record<string, string> = {
  alba: 'RO-AB', arad: 'RO-AR', arges: 'RO-AG', bacau: 'RO-BC', bihor: 'RO-BH',
  'bistrita-nasaud': 'RO-BN', 'bistrita nasaud': 'RO-BN', botosani: 'RO-BT', braila: 'RO-BR',
  brasov: 'RO-BV', bucuresti: 'RO-B', buzau: 'RO-BZ', 'caras-severin': 'RO-CS', 'caras severin': 'RO-CS',
  calarasi: 'RO-CL', cluj: 'RO-CJ', constanta: 'RO-CT', covasna: 'RO-CV', dambovita: 'RO-DB',
  dolj: 'RO-DJ', galati: 'RO-GL', giurgiu: 'RO-GR', gorj: 'RO-GJ', harghita: 'RO-HR',
  hunedoara: 'RO-HD', ialomita: 'RO-IL', iasi: 'RO-IS', ilfov: 'RO-IF', maramures: 'RO-MM',
  mehedinti: 'RO-MH', mures: 'RO-MS', neamt: 'RO-NT', olt: 'RO-OT', prahova: 'RO-PH',
  'satu mare': 'RO-SM', salaj: 'RO-SJ', sibiu: 'RO-SB', suceava: 'RO-SV', teleorman: 'RO-TR',
  timis: 'RO-TM', tulcea: 'RO-TL', vaslui: 'RO-VS', valcea: 'RO-VL', vrancea: 'RO-VN',
};
function resolveCountyCode(addr: { street?: string; city?: string }): string | null {
  const hay = `${addr.street || ''} ${addr.city || ''}`.toLowerCase()
    .replace(/[ăâ]/g, 'a').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/î/g, 'i');
  // Caută cel mai lung nume de județ prezent ca întreg cuvânt.
  let best: string | null = null, bestLen = 0;
  for (const [name, code] of Object.entries(RO_COUNTIES)) {
    const re = new RegExp(`(^|[^a-z])${name.replace(/[-\s]/g, '[-\\s]')}([^a-z]|$)`);
    if (re.test(hay) && name.length > bestLen) { best = code; bestLen = name.length; }
  }
  return best;
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
  precedingInvoiceRef?: { number: string; issueDate: string }; // storno: referință (BG-3) la factura originală
  supplierVatPayer?: boolean; // false => emitent neplătitor TVA: liniile devin categoria O (neimpozabil)
}

const xmlEscape = (s: string) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );

const money = (cents: number) => (cents / 100).toFixed(2);

function partyXml(party: Party, role: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
  // PartyLegalEntity/CompanyID. For a NON-VAT-payer there is no PartyTaxScheme, so
  // the CUI must live here or ANAF can't identify the party ("cui vanzator=0").
  // VAT payers keep reg.com here (their CUI is in PartyTaxScheme = RO+cui).
  const legalId = party.vatPayer ? (party.registrationNumber || `RO${party.cui}`) : party.cui;
  const countryCode = party.address.country.slice(0, 2).toUpperCase();
  // BR-RO-110: pentru RO, subdiviziunea = cod ISO 3166-2:RO (ex. RO-CT). București = RO-B.
  const county = countryCode === 'RO' ? resolveCountyCode(party.address) : null;
  return `
  <cac:${role}>
    <cac:Party>
      <cac:PartyName><cbc:Name>${xmlEscape(party.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(party.address.street)}</cbc:StreetName>
        <cbc:CityName>${xmlEscape(party.address.city)}</cbc:CityName>
        ${party.address.postalCode ? `<cbc:PostalZone>${xmlEscape(party.address.postalCode)}</cbc:PostalZone>` : ''}
        ${county ? `<cbc:CountrySubentity>${county}</cbc:CountrySubentity>` : ''}
        <cac:Country><cbc:IdentificationCode>${xmlEscape(countryCode)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${
        party.vatPayer
          ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${xmlEscape(countryCode)}${xmlEscape(party.cui)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
          : ''
      }
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(party.name)}</cbc:RegistrationName>
        ${countryCode === 'RO' ? `<cbc:CompanyID>${xmlEscape(legalId)}</cbc:CompanyID>` : ''}
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
        ${cat === 'O' ? '' : `<cbc:Percent>${percent.toFixed(2)}</cbc:Percent>`}
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
      // BR-CO-10: LineExtensionAmount must equal round(printed quantity × price).
      // Round the quantity to 4 decimals (EN16931 max) and use that SAME value for
      // both the net computation and the printed InvoicedQuantity, so they reconcile
      // exactly even for fractional quantities.
      const qRounded = Math.round(line.quantity * 1e4) / 1e4;
      const lineNetCents = Math.round(qRounded * line.unitPriceCents);
      netTotalCents += lineNetCents;
      // BR-27: prețul unitar (BT-146) nu poate fi negativ. La storno (preț negativ)
      // mutăm semnul pe cantitate: preț pozitiv, cantitate negativă, net neschimbat.
      const priceCents = Math.abs(line.unitPriceCents);
      const qty = line.unitPriceCents < 0 ? -qRounded : qRounded;
      const unitCode = mapUnitCode(line.unit);
      // Emitent neplătitor de TVA: toate liniile sunt categoria O (neimpozabil), 0%.
      const cat: VatCategory = input.supplierVatPayer === false
        ? 'O'
        : (line.vatCategory ?? (line.vatPercent > 0 ? 'S' : 'Z'));
      const percent = cat === 'S' || cat === 'Z' ? line.vatPercent : 0;
      const key = `${cat}|${percent}`;
      const g = groups.get(key);
      if (g) g.netCents += lineNetCents;
      else groups.set(key, { cat, percent, netCents: lineNetCents, exemptionText: line.exemptionReason });

      return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${xmlEscape(unitCode)}">${qty.toFixed(4)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${money(lineNetCents)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${cat}</cbc:ID>
        ${cat === 'O' ? '' : `<cbc:Percent>${percent.toFixed(2)}</cbc:Percent>`}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${cur}">${money(priceCents)}</cbc:PriceAmount>
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

  // Pentru valută străină: TVA exprimată în RON (BT-111). NU emitem
  // cac:TaxExchangeRate — e interzis de UBL-CR-490; cursul reiese din TVA în RON.
  const vatTotalRon = ((vatTotalCents / 100) * rate).toFixed(2);
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
  ${input.precedingInvoiceRef ? `<cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${xmlEscape(input.precedingInvoiceRef.number)}</cbc:ID>
      <cbc:IssueDate>${input.precedingInvoiceRef.issueDate}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ''}
  ${partyXml(input.supplierVatPayer === false ? { ...input.supplier, vatPayer: false } : input.supplier, 'AccountingSupplierParty')}
  ${partyXml(input.supplierVatPayer === false ? { ...input.customer, vatPayer: false } : input.customer, 'AccountingCustomerParty')}
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
