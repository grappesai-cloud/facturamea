// Frontend parser for ANAF e-Factura (UBL 2.1 / CIUS-RO) XML → readable invoice
// data. Runs in the browser (DOMParser), so the full received invoice can be shown
// without any backend "parsed invoice" endpoint. Namespace-agnostic: matches by
// localName so it works regardless of the cbc:/cac: prefixes used.

export interface EfacturaLine {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  vatPct: number | null;
}

export interface EfacturaParsed {
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  supplier: { name: string; cui: string; address: string };
  buyer: { name: string; cui: string };
  lines: EfacturaLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  note: string;
}

// All descendants of `root` whose localName matches `tag`.
function els(root: Element | Document, tag: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === tag);
}
// First descendant text (trimmed) for localName, or ''.
function txt(root: Element | Document, tag: string): string {
  return els(root, tag)[0]?.textContent?.trim() ?? '';
}
function num(s: string): number {
  const n = parseFloat((s || '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function party(root: Element | Document, wrapperTag: string): { name: string; cui: string; address: string } {
  const wrap = els(root, wrapperTag)[0];
  if (!wrap) return { name: '', cui: '', address: '' };
  const partyEl = els(wrap, 'Party')[0] || wrap;
  // Prefer the legal registration name, fall back to PartyName/Name.
  const name = txt(partyEl, 'RegistrationName') || txt(partyEl, 'Name');
  // CUI: PartyTaxScheme/CompanyID, else PartyLegalEntity/CompanyID.
  let cui = '';
  for (const c of els(partyEl, 'CompanyID')) { if (c.textContent?.trim()) { cui = c.textContent.trim(); break; } }
  const addrEl = els(partyEl, 'PostalAddress')[0];
  const address = addrEl
    ? [txt(addrEl, 'StreetName'), txt(addrEl, 'CityName'), txt(addrEl, 'CountrySubentity')].filter(Boolean).join(', ')
    : '';
  return { name, cui, address };
}

export function parseEfacturaXml(xml: string): EfacturaParsed | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const root = doc.documentElement;
    if (!root) return null;

    // Document-level fields: direct-child cbc:* of the Invoice/CreditNote root.
    const directChild = (tag: string) =>
      Array.from(root.children).find((c) => c.localName === tag)?.textContent?.trim() ?? '';

    const number = directChild('ID');
    const issueDate = directChild('IssueDate');
    const dueDate = directChild('DueDate');
    const currency = directChild('DocumentCurrencyCode') || 'RON';
    const note = directChild('Note');

    const supplier = party(doc, 'AccountingSupplierParty');
    const buyer = party(doc, 'AccountingCustomerParty');

    const lineTags = els(doc, 'InvoiceLine').length ? 'InvoiceLine' : 'CreditNoteLine';
    const lines: EfacturaLine[] = els(doc, lineTags).map((ln) => {
      const item = els(ln, 'Item')[0];
      const qtyEl = els(ln, 'InvoicedQuantity')[0] || els(ln, 'CreditedQuantity')[0];
      const priceEl = els(ln, 'Price')[0];
      const taxCat = item ? els(item, 'ClassifiedTaxCategory')[0] : undefined;
      return {
        name: item ? (txt(item, 'Name') || txt(item, 'Description')) : '',
        qty: num(qtyEl?.textContent ?? '1'),
        unit: qtyEl?.getAttribute('unitCode') ?? '',
        unitPrice: priceEl ? num(txt(priceEl, 'PriceAmount')) : 0,
        lineTotal: num(txt(ln, 'LineExtensionAmount')),
        vatPct: taxCat ? num(txt(taxCat, 'Percent')) : null,
      };
    });

    const monetary = els(doc, 'LegalMonetaryTotal')[0];
    const subtotal = monetary ? num(txt(monetary, 'LineExtensionAmount')) : lines.reduce((s, l) => s + l.lineTotal, 0);
    const total = monetary ? num(txt(monetary, 'TaxInclusiveAmount') || txt(monetary, 'PayableAmount')) : 0;
    // VAT total: the TaxTotal directly under the document (not per-line TaxTotal).
    let vatTotal = 0;
    for (const tt of els(doc, 'TaxTotal')) {
      const amt = num(txt(tt, 'TaxAmount'));
      if (amt > vatTotal) vatTotal = amt; // the document-level TaxTotal is the largest
    }
    if (!vatTotal && total && subtotal) vatTotal = Math.max(0, total - subtotal);

    return { number, issueDate, dueDate, currency, supplier, buyer, lines, subtotal, vatTotal, total, note };
  } catch {
    return null;
  }
}
