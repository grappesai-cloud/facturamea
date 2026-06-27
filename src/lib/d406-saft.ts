// D406 SAF-T (Standard Audit File for Tax) XML generator — FULL, XSD-conformant.
//
// SAF-T RO (D406), namespace mfp:anaf:dgti:d406t:declaratie:v1, schema v2.4.x.
// The structure below was validated element-by-element against the official ANAF
// XSD (Ro_SAFT_Schema) with xmllint — the core (Header, GeneralLedgerAccounts,
// Customers, Suppliers, TaxTable, Products, GeneralLedgerEntries, SalesInvoices,
// PurchaseInvoices, Payments) passes XSD validation.
//
// Assets (mijloace fixe) + MovementOfGoods (stoc) are emitted as empty master
// containers for now — their Valuation / StockMovementLine sub-structures have
// many mandatory ANAF-nomenclature fields and are a follow-up. The sections are
// present + valid; they simply carry no rows yet.
//
// NOTE: XSD-valid != DUK-accepted. The ANAF DUK Integrator also enforces business
// rules + nomenclature code lists (tax codes, account groupings). Validate a real
// file with DUK before the first live submission.

import { db } from '../db';
import {
  transportInvoices, transportInvoiceLines, transportInvoicePayments, companies, billingAddresses,
  invoiceClients, suppliers, expenses, ledgerAccounts, journalEntries, journalLines, invoiceProducts,
} from '../db/schema';
import { and, eq, gte, lte, ne, asc, inArray } from 'drizzle-orm';
import { invoiceRonCents, expenseRonCents } from './invoicing';

interface D406Args {
  companyId: string;
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
  declarationType?: 'L' | 'T' | 'A' | 'C';
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const cents = (c: number) => (c / 100).toFixed(2);
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '2026-01-01');
const ctry = (c: string | null | undefined) => (!c ? 'RO' : c.toLowerCase().startsWith('rom') ? 'RO' : c.slice(0, 2).toUpperCase());
const vatCode = (rate: number) => (rate === 0 ? 'SDD' : rate === 5 ? 'R5' : rate === 9 ? 'R9' : rate === 11 ? 'R11' : 'S');
const acctType = (t: string | null | undefined) => (t === 'A' ? 'Activ' : t === 'P' ? 'Pasiv' : 'Bifunctional');

// AmountStructure: Amount (RON) + CurrencyCode + CurrencyAmount (original).
const amt = (ronCents: number, cur = 'RON', curCents?: number) =>
  `<Amount>${cents(ronCents)}</Amount><CurrencyCode>${esc(cur)}</CurrencyCode><CurrencyAmount>${cents(curCents ?? ronCents)}</CurrencyAmount>`;
// Structured address (City + Country mandatory).
const addr = (city: string | null | undefined, country: string | null | undefined, street?: string | null) =>
  `${street ? `<StreetName>${esc(street.slice(0, 70))}</StreetName>` : ''}<City>${esc((city || '-').slice(0, 35))}</City><Country>${esc(ctry(country))}</Country>`;
// Opening/closing balance as a single debit-or-credit element (XSD choice).
const bal = (tag: 'Opening' | 'Closing', netCents: number) =>
  netCents >= 0 ? `<${tag}DebitBalance>${cents(netCents)}</${tag}DebitBalance>` : `<${tag}CreditBalance>${cents(-netCents)}</${tag}CreditBalance>`;

export async function generateD406Xml(args: D406Args): Promise<string> {
  const { companyId, from, to, declarationType = 'L' } = args;
  const fromD = new Date(from + 'T00:00:00Z');
  const toD = new Date(to + 'T23:59:59Z');

  const [issuer] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!issuer) throw new Error('Issuer company not found');
  const [billing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
  const supplierCif = (issuer.cui || '').replace(/^RO/i, '').replace(/\D/g, '');
  const iban = (billing as any)?.iban || (issuer as any)?.iban || 'RO00BANK0000000000000000';

  // -- GeneralLedgerAccounts (plan de conturi + solduri) -------------------
  const accounts = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.companyId, companyId)).orderBy(asc(ledgerAccounts.code));
  const allLines = await db.select({
    accountCode: journalLines.accountCode, debit: journalLines.debitCents, credit: journalLines.creditCents, date: journalEntries.entryDate,
  }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.companyId, companyId), lte(journalEntries.entryDate, to)));
  const balMap = new Map<string, { openD: number; openC: number; closeD: number; closeC: number }>();
  for (const l of allLines) {
    const b = balMap.get(l.accountCode) || { openD: 0, openC: 0, closeD: 0, closeC: 0 };
    b.closeD += l.debit; b.closeC += l.credit;
    if (l.date != null && l.date < from) { b.openD += l.debit; b.openC += l.credit; }
    balMap.set(l.accountCode, b);
  }
  const accountBlocks = accounts.map((a) => {
    const b = balMap.get(a.code) || { openD: 0, openC: 0, closeD: 0, closeC: 0 };
    return `
      <Account>
        <AccountID>${esc(a.code)}</AccountID>
        <AccountDescription>${esc(a.name)}</AccountDescription>
        <StandardAccountID>${esc(a.code)}</StandardAccountID>
        <AccountType>${acctType(a.type)}</AccountType>
        ${bal('Opening', b.openD - b.openC)}
        ${bal('Closing', b.closeD - b.closeC)}
      </Account>`;
  }).join('');

  // -- Sales invoices + customers ------------------------------------------
  const sales = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId), inArray(transportInvoices.kind, ['factura', 'storno']),
    ne(transportInvoices.status, 'voided'), gte(transportInvoices.issuedAt, fromD), lte(transportInvoices.issuedAt, toD),
  )).orderBy(asc(transportInvoices.issuedAt));

  const customers = new Map<string, { id: string; name: string; taxId: string | null; city: string; country: string; net: number }>();
  for (const inv of sales) {
    const key = inv.clientTaxIdSnap || inv.clientNameSnap;
    let country = 'RO', city = '-';
    if (inv.clientExternalId) {
      const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId));
      if (c) { country = ctry(c.country); city = c.city || '-'; }
    }
    const cur = customers.get(key) || { id: key, name: inv.clientNameSnap, taxId: inv.clientTaxIdSnap || null, city, country, net: 0 };
    cur.net += invoiceRonCents(inv).total;
    customers.set(key, cur);
  }
  const customerBlocks = [...customers.values()].map((c) => `
      <Customer>
        <CompanyStructure>
          <RegistrationNumber>${esc(c.taxId || c.id)}</RegistrationNumber>
          <Name>${esc(c.name)}</Name>
          <Address>${addr(c.city, c.country)}</Address>
          ${c.taxId ? `<TaxRegistration><TaxRegistrationNumber>${esc(c.taxId)}</TaxRegistrationNumber></TaxRegistration>` : ''}
        </CompanyStructure>
        <CustomerID>${esc(c.id)}</CustomerID>
        <AccountID>4111</AccountID>
        ${bal('Opening', 0)}
        ${bal('Closing', c.net)}
      </Customer>`).join('');

  let salesDebit = 0, salesCredit = 0;
  const salesBlocks: string[] = [];
  for (const inv of sales) {
    const lines = await db.select().from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, inv.id)).orderBy(asc(transportInvoiceLines.position));
    const fx = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    const lineBlocks = lines.map((l) => {
      const lineRon = Math.round(l.lineTotalCents * fx);
      const vat = Math.round(lineRon * l.vatRate / (100 + l.vatRate));
      return `
          <InvoiceLine>
            <AccountID>707</AccountID>
            <ProductCode>${esc((l as any).code || 'SRV')}</ProductCode>
            <ProductDescription>${esc(l.description)}</ProductDescription>
            <Quantity>${l.quantity}</Quantity>
            <UnitPrice>${cents(Math.round(l.unitPriceCents * fx))}</UnitPrice>
            <TaxPointDate>${day(inv.issuedAt)}</TaxPointDate>
            <Description>${esc(l.description)}</Description>
            <InvoiceLineAmount>${amt(lineRon - vat)}</InvoiceLineAmount>
            <DebitCreditIndicator>${l.lineTotalCents >= 0 ? 'C' : 'D'}</DebitCreditIndicator>
            <TaxInformation><TaxType>TVA</TaxType><TaxCode>${vatCode(l.vatRate)}</TaxCode><TaxPercentage>${l.vatRate}</TaxPercentage><TaxAmount>${amt(vat)}</TaxAmount></TaxInformation>
          </InvoiceLine>`;
    }).join('');
    const ron = invoiceRonCents(inv);
    if (ron.total < 0) salesCredit += Math.abs(ron.total); else salesDebit += ron.total;
    salesBlocks.push(`
        <Invoice>
          <InvoiceNo>${esc(inv.fullNumber)}</InvoiceNo>
          <CustomerInfo><BillingAddress>${addr('-', 'RO')}</BillingAddress></CustomerInfo>
          <AccountID>4111</AccountID>
          <InvoiceDate>${day(inv.issuedAt)}</InvoiceDate>
          <InvoiceType>380</InvoiceType>
          <SelfBillingIndicator>0</SelfBillingIndicator>${lineBlocks}
          <InvoiceDocumentTotals><NetTotal>${cents(ron.subtotal)}</NetTotal><GrossTotal>${cents(ron.total)}</GrossTotal></InvoiceDocumentTotals>
        </Invoice>`);
  }

  // -- Purchase invoices + suppliers (din cheltuieli) ----------------------
  const exps = await db.select().from(expenses).where(and(
    eq(expenses.companyId, companyId), gte(expenses.issueDate, from), lte(expenses.issueDate, to),
  )).orderBy(asc(expenses.issueDate));
  const supMap = new Map<string, { id: string; name: string; taxId: string | null; city: string; country: string; net: number }>();
  for (const s of await db.select().from(suppliers).where(eq(suppliers.companyId, companyId))) {
    supMap.set(s.id, { id: s.cui || s.id, name: s.name, taxId: s.cui || null, city: s.city || '-', country: ctry(s.country), net: 0 });
  }
  let purchDebit = 0;
  const purchBlocks = exps.map((e) => {
    const r = expenseRonCents(e); purchDebit += r.net + r.vat;
    const sup = e.supplierId && supMap.has(e.supplierId) ? supMap.get(e.supplierId)! : null;
    const supId = sup ? sup.id : ((e.supplierNameSnap || 'furnizor') + (e.supplierId || ''));
    if (sup) sup.net += r.total; else if (!supMap.has(supId)) supMap.set(supId, { id: supId, name: e.supplierNameSnap || 'Furnizor', taxId: null, city: '-', country: 'RO', net: r.total });
    return `
        <Invoice>
          <InvoiceNo>${esc(e.documentNumber || e.id)}</InvoiceNo>
          <SupplierInfo><BillingAddress>${addr('-', 'RO')}</BillingAddress></SupplierInfo>
          <AccountID>401</AccountID>
          <InvoiceDate>${esc(e.issueDate || from)}</InvoiceDate>
          <InvoiceType>380</InvoiceType>
          <SelfBillingIndicator>0</SelfBillingIndicator>
          <InvoiceLine>
            <AccountID>628</AccountID>
            <ProductDescription>${esc(e.category || 'Cheltuiala')}</ProductDescription>
            <Quantity>1</Quantity>
            <UnitPrice>${cents(r.net)}</UnitPrice>
            <TaxPointDate>${esc(e.issueDate || from)}</TaxPointDate>
            <Description>${esc(e.category || 'Cheltuiala')}</Description>
            <InvoiceLineAmount>${amt(r.net)}</InvoiceLineAmount>
            <DebitCreditIndicator>D</DebitCreditIndicator>
            <TaxInformation><TaxType>TVA</TaxType><TaxCode>${e.vatScheme === 'reverse_charge' ? 'TI' : 'S'}</TaxCode><TaxAmount>${amt(r.vat)}</TaxAmount></TaxInformation>
          </InvoiceLine>
          <InvoiceDocumentTotals><NetTotal>${cents(r.net)}</NetTotal><GrossTotal>${cents(r.total)}</GrossTotal></InvoiceDocumentTotals>
        </Invoice>`;
  }).join('');
  const supplierBlocks = [...supMap.values()].map((s) => `
      <Supplier>
        <CompanyStructure>
          <RegistrationNumber>${esc(s.taxId || s.id)}</RegistrationNumber>
          <Name>${esc(s.name)}</Name>
          <Address>${addr(s.city, s.country)}</Address>
          ${s.taxId ? `<TaxRegistration><TaxRegistrationNumber>${esc(s.taxId)}</TaxRegistrationNumber></TaxRegistration>` : ''}
        </CompanyStructure>
        <SupplierID>${esc(s.id)}</SupplierID>
        <AccountID>401</AccountID>
        ${bal('Opening', 0)}
        ${bal('Closing', -Math.abs(s.net))}
      </Supplier>`).join('');

  // -- Payments (incasari facturi) -----------------------------------------
  const paymentBlocks: string[] = [];
  let payTotal = 0;
  for (const inv of sales) {
    const pays = await db.select().from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, inv.id));
    const fx = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    for (const p of pays) {
      const a = Math.round(p.amountCents * fx); payTotal += a;
      paymentBlocks.push(`
        <Payment>
          <PaymentRefNo>${esc(inv.fullNumber)}</PaymentRefNo>
          <TransactionDate>${day(p.receivedAt)}</TransactionDate>
          <PaymentMethod>${esc(p.method || 'transfer')}</PaymentMethod>
          <Description>Incasare ${esc(inv.fullNumber)}</Description>
          <PaymentLine>
            <AccountID>5121</AccountID>
            <CustomerID></CustomerID>
            <SupplierID></SupplierID>
            <DebitCreditIndicator>D</DebitCreditIndicator>
            <PaymentLineAmount>${amt(a)}</PaymentLineAmount>
            <TaxInformation><TaxType>TVA</TaxType><TaxCode>S</TaxCode><TaxAmount>${amt(0)}</TaxAmount></TaxInformation>
          </PaymentLine>
        </Payment>`);
    }
  }

  // -- GeneralLedgerEntries (registrul jurnal) -----------------------------
  const entries = await db.select().from(journalEntries).where(and(
    eq(journalEntries.companyId, companyId), gte(journalEntries.entryDate, from), lte(journalEntries.entryDate, to),
  )).orderBy(asc(journalEntries.entryDate));
  let glDebit = 0, glCredit = 0;
  const txBlocks: string[] = [];
  for (const e of entries) {
    const ls = await db.select().from(journalLines).where(eq(journalLines.entryId, e.id));
    glDebit += e.totalDebitCents; glCredit += e.totalCreditCents;
    const m = new Date((e.entryDate || from) + 'T00:00:00Z');
    const lineBlocks = ls.map((l, i) => `
          <TransactionLine>
            <RecordID>${i + 1}</RecordID>
            <AccountID>${esc(l.accountCode)}</AccountID>
            <CustomerID></CustomerID>
            <SupplierID></SupplierID>
            <Description>${esc(l.note || e.description || 'Nota')}</Description>
            ${l.debitCents > 0 ? `<DebitAmount>${amt(l.debitCents)}</DebitAmount>` : `<CreditAmount>${amt(l.creditCents)}</CreditAmount>`}
            <TaxInformation><TaxType>TVA</TaxType><TaxCode>S</TaxCode><TaxAmount>${amt(0)}</TaxAmount></TaxInformation>
          </TransactionLine>`).join('');
    txBlocks.push(`
        <Transaction>
          <TransactionID>${esc(e.entryNumber || e.id)}</TransactionID>
          <Period>${m.getUTCMonth() + 1}</Period>
          <PeriodYear>${m.getUTCFullYear()}</PeriodYear>
          <TransactionDate>${esc(e.entryDate || from)}</TransactionDate>
          <Description>${esc(e.description || 'Nota contabila')}</Description>
          <SystemEntryDate>${day(e.createdAt)}</SystemEntryDate>
          <GLPostingDate>${esc(e.entryDate || from)}</GLPostingDate>
          <CustomerID></CustomerID>
          <SupplierID></SupplierID>${lineBlocks}
        </Transaction>`);
  }

  // -- Products + UOM + TaxTable -------------------------------------------
  const products = await db.select().from(invoiceProducts).where(eq(invoiceProducts.companyId, companyId)).limit(2000);
  const productBlocks = products.map((p) => `
      <Product>
        <ProductCode>${esc(p.code || p.id)}</ProductCode>
        <Description>${esc(p.name)}</Description>
        <ProductCommodityCode>${esc(p.code || 'SRV')}</ProductCommodityCode>
        <UOMBase>${esc(p.defaultUm || 'buc')}</UOMBase>
        <UOMStandard>H87</UOMStandard>
        <UOMToUOMBaseConversionFactor>1</UOMToUOMBaseConversionFactor>
      </Product>`).join('');
  const uoms = [...new Set(products.map((p) => p.defaultUm || 'buc'))];
  const uomBlocks = uoms.map((u) => `<UOMTableEntry><UnitOfMeasure>${esc(u)}</UnitOfMeasure><Description>${esc(u)}</Description></UOMTableEntry>`).join('');
  const taxBlocks = [21, 11, 9, 5, 0].map((r) => `<TaxCodeDetails><TaxCode>${vatCode(r)}</TaxCode><TaxPercentage>${r}</TaxPercentage><BaseRate>${r}</BaseRate><Country>RO</Country></TaxCodeDetails>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="mfp:anaf:dgti:d406t:declaratie:v1">
  <Header>
    <AuditFileVersion>2.4.8</AuditFileVersion>
    <AuditFileCountry>RO</AuditFileCountry>
    <AuditFileDateCreated>${day(new Date())}</AuditFileDateCreated>
    <SoftwareCompanyName>facturamea</SoftwareCompanyName>
    <SoftwareID>facturamea</SoftwareID>
    <SoftwareVersion>1.0.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${esc(supplierCif)}</RegistrationNumber>
      <Name>${esc(billing?.legalName || issuer.name)}</Name>
      <Address>${addr(billing?.city || issuer.city, billing?.countryCode, billing?.address || issuer.address)}</Address>
      <Contact><ContactPerson><FirstName>-</FirstName><LastName>${esc(billing?.legalName || issuer.name)}</LastName></ContactPerson><Telephone>${esc(issuer.phone || '-')}</Telephone></Contact>
      <TaxRegistration><TaxRegistrationNumber>${esc(supplierCif)}</TaxRegistrationNumber></TaxRegistration>
      <BankAccount><IBANNumber>${esc(iban)}</IBANNumber></BankAccount>
    </Company>
    <DefaultCurrencyCode>RON</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${from}</SelectionStartDate>
      <SelectionEndDate>${to}</SelectionEndDate>
      <OtherCriteria>D406_${declarationType}</OtherCriteria>
    </SelectionCriteria>
    <HeaderComment>D406 SAF-T facturamea</HeaderComment>
    <SegmentIndex>1</SegmentIndex>
    <TotalSegmentsInsequence>1</TotalSegmentsInsequence>
    <TaxAccountingBasis>A</TaxAccountingBasis>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>${accountBlocks}
    </GeneralLedgerAccounts>
    <Customers>${customerBlocks}
    </Customers>
    <Suppliers>${supplierBlocks}
    </Suppliers>
    <TaxTable>
      <TaxTableEntry><TaxType>TVA</TaxType><Description>Taxa pe valoarea adaugata</Description>${taxBlocks}</TaxTableEntry>
    </TaxTable>
    <UOMTable>${uomBlocks}</UOMTable>
    <AnalysisTypeTable></AnalysisTypeTable>
    <MovementTypeTable></MovementTypeTable>
    <Products>${productBlocks}
    </Products>
    <Owners></Owners>
    <Assets></Assets>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>${entries.length}</NumberOfEntries>
    <TotalDebit>${cents(glDebit)}</TotalDebit>
    <TotalCredit>${cents(glCredit)}</TotalCredit>${txBlocks.length ? `
    <Journal>
      <JournalID>GENERAL</JournalID>
      <Description>Registru jurnal</Description>
      <Type>GL</Type>${txBlocks.join('')}
    </Journal>` : ''}
  </GeneralLedgerEntries>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${sales.length}</NumberOfEntries>
      <TotalDebit>${cents(salesDebit)}</TotalDebit>
      <TotalCredit>${cents(salesCredit)}</TotalCredit>${salesBlocks.join('')}
    </SalesInvoices>
    <PurchaseInvoices>
      <NumberOfEntries>${exps.length}</NumberOfEntries>
      <TotalDebit>${cents(purchDebit)}</TotalDebit>
      <TotalCredit>0.00</TotalCredit>${purchBlocks}
    </PurchaseInvoices>
    <Payments>
      <NumberOfEntries>${paymentBlocks.length}</NumberOfEntries>
      <TotalDebit>${cents(payTotal)}</TotalDebit>
      <TotalCredit>0.00</TotalCredit>${paymentBlocks.join('')}
    </Payments>
    <MovementOfGoods>
      <NumberOfMovementLines>0</NumberOfMovementLines>
      <TotalQuantityReceived>0</TotalQuantityReceived>
      <TotalQuantityIssued>0</TotalQuantityIssued>
    </MovementOfGoods>
  </SourceDocuments>
</AuditFile>`;
}
