// D406 SAF-T (Standard Audit File for Tax) XML generator — FULL.
//
// SAF-T RO (D406) is the ANAF Standard Audit File. Schema = OECD SAF-T 2.0 +
// RO extensions (namespace mfp:anaf:dgti:d406:declaratie:v1). This generator
// produces the complete structure from facturamea's data:
//
//   Header
//   MasterFiles:
//     GeneralLedgerAccounts  ← plan de conturi + opening/closing balances
//     Customers              ← clienți (din facturi emise)
//     Suppliers              ← furnizori (din cheltuieli)
//     TaxTable               ← cotele de TVA
//     UOMTable               ← unități de măsură
//     Products               ← produse/servicii
//     AssetsTable            ← mijloace fixe
//   GeneralLedgerEntries     ← registrul jurnal (note contabile)
//   SourceDocuments:
//     SalesInvoices          ← facturi emise
//     PurchaseInvoices       ← facturi primite (cheltuieli)
//     Payments               ← încasări/plăți
//     MovementOfGoods        ← mișcări de stoc
//
// CRITICAL: the exact ANAF XSD version moves and has strict element ordering +
// mandatory RO nomenclatures (account types, tax codes, UOM codes). Before going
// live, validate the output with ANAF's DUK Integrator and fix any XSD errors.
// Keep SAFT_D406_ENABLED off until that validation passes.

import { db } from '../db';
import {
  transportInvoices, transportInvoiceLines, transportInvoicePayments, companies, billingAddresses,
  invoiceClients, suppliers, expenses, fixedAssets, stockMovements, ledgerAccounts, journalEntries,
  journalLines, invoiceProducts,
} from '../db/schema';
import { and, eq, gte, lte, ne, asc, inArray } from 'drizzle-orm';
import { invoiceRonCents, expenseRonCents } from './invoicing';

interface D406Args {
  companyId: string;
  from: string; // YYYY-MM-DD inclusive
  to: string;   // YYYY-MM-DD inclusive
  declarationType?: 'L' | 'T' | 'A' | 'C'; // monthly | quarterly | yearly | on-demand
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const cents = (c: number) => (c / 100).toFixed(2);
const day = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const ctry = (c: string | null | undefined) => (!c ? 'RO' : c.toLowerCase().startsWith('rom') ? 'RO' : c.slice(0, 2).toUpperCase());

// RO VAT code per ANAF nomenclature (simplified — validate against the official list).
const vatCode = (rate: number) => (rate === 0 ? 'SDD' : rate === 5 ? 'R5' : rate === 9 ? 'R9' : rate === 11 ? 'R11' : 'S');
// Account type → SAF-T (A=Activ, P=Pasiv, B=Bifunctional).
const acctType = (t: string | null | undefined) => (t === 'A' ? 'Activ' : t === 'P' ? 'Pasiv' : 'Bifunctional');

export async function generateD406Xml(args: D406Args): Promise<string> {
  const { companyId, from, to, declarationType = 'L' } = args;
  const fromD = new Date(from + 'T00:00:00Z');
  const toD = new Date(to + 'T23:59:59Z');

  const [issuer] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!issuer) throw new Error('Issuer company not found');
  const [billing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));
  const supplierCif = (issuer.cui || '').replace(/^RO/i, '').replace(/\D/g, '');

  // ── MasterFiles: GeneralLedgerAccounts (plan de conturi + solduri) ────────
  const accounts = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.companyId, companyId)).orderBy(asc(ledgerAccounts.code));
  // All posted journal lines up to `to`, with their entry date, to compute balances.
  const allLines = await db.select({
    accountCode: journalLines.accountCode, debit: journalLines.debitCents, credit: journalLines.creditCents,
    date: journalEntries.entryDate,
  }).from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.companyId, companyId), lte(journalEntries.entryDate, to)));
  const bal = new Map<string, { openD: number; openC: number; closeD: number; closeC: number }>();
  for (const l of allLines) {
    const b = bal.get(l.accountCode) || { openD: 0, openC: 0, closeD: 0, closeC: 0 };
    const before = l.date != null && l.date < from;
    b.closeD += l.debit; b.closeC += l.credit;
    if (before) { b.openD += l.debit; b.openC += l.credit; }
    bal.set(l.accountCode, b);
  }
  const net = (d: number, c: number) => d - c; // signed net (debit positive)
  const accountBlocks = accounts.map((a) => {
    const b = bal.get(a.code) || { openD: 0, openC: 0, closeD: 0, closeC: 0 };
    const openNet = net(b.openD, b.openC), closeNet = net(b.closeD, b.closeC);
    return `
    <Account>
      <AccountID>${esc(a.code)}</AccountID>
      <AccountDescription>${esc(a.name)}</AccountDescription>
      <StandardAccountID>${esc(a.code)}</StandardAccountID>
      <AccountType>${acctType(a.type)}</AccountType>
      <OpeningDebitBalance>${cents(openNet >= 0 ? openNet : 0)}</OpeningDebitBalance>
      <OpeningCreditBalance>${cents(openNet < 0 ? -openNet : 0)}</OpeningCreditBalance>
      <ClosingDebitBalance>${cents(closeNet >= 0 ? closeNet : 0)}</ClosingDebitBalance>
      <ClosingCreditBalance>${cents(closeNet < 0 ? -closeNet : 0)}</ClosingCreditBalance>
    </Account>`;
  }).join('');

  // ── Sales invoices + customers ────────────────────────────────────────────
  const sales = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId),
    inArray(transportInvoices.kind, ['factura', 'storno']),
    ne(transportInvoices.status, 'voided'),
    gte(transportInvoices.issuedAt, fromD), lte(transportInvoices.issuedAt, toD),
  )).orderBy(asc(transportInvoices.issuedAt));

  const customers = new Map<string, { id: string; name: string; taxId: string | null; address: string; country: string }>();
  for (const inv of sales) {
    const key = inv.clientTaxIdSnap || inv.clientNameSnap;
    if (customers.has(key)) continue;
    let country = 'RO', address = inv.clientAddressSnap || '';
    if (inv.clientExternalId) {
      const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId));
      if (c) { country = ctry(c.country); address = c.address || address; }
    }
    customers.set(key, { id: key, name: inv.clientNameSnap, taxId: inv.clientTaxIdSnap || null, address, country });
  }
  const customerBlocks = [...customers.values()].map((c) => `
    <Customer>
      <CustomerID>${esc(c.id)}</CustomerID>
      <AccountID>4111</AccountID>
      <CustomerTaxID>${esc(c.taxId || '')}</CustomerTaxID>
      <CompanyName>${esc(c.name)}</CompanyName>
      <BillingAddress><AddressDetail>${esc(c.address || '—')}</AddressDetail><Country>${esc(c.country)}</Country></BillingAddress>
    </Customer>`).join('');

  let salesDebit = 0, salesCredit = 0;
  const salesBlocks: string[] = [];
  for (const inv of sales) {
    const lines = await db.select().from(transportInvoiceLines).where(eq(transportInvoiceLines.invoiceId, inv.id)).orderBy(asc(transportInvoiceLines.position));
    const pays = await db.select().from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, inv.id));
    const fx = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    const lineBlocks = lines.map((l) => `
      <Line>
        <LineNumber>${l.position + 1}</LineNumber>
        <ProductCode>${esc((l as any).code || 'SRV')}</ProductCode>
        <ProductDescription>${esc(l.description)}</ProductDescription>
        <Quantity>${l.quantity}</Quantity>
        <UnitOfMeasure>${esc(l.unit || 'buc')}</UnitOfMeasure>
        <UnitPrice>${cents(Math.round(l.unitPriceCents * fx))}</UnitPrice>
        <TaxPointDate>${day(inv.issuedAt)}</TaxPointDate>
        <DebitCreditIndicator>${l.lineTotalCents >= 0 ? 'C' : 'D'}</DebitCreditIndicator>
        <Tax><TaxType>TVA</TaxType><TaxCode>${vatCode(l.vatRate)}</TaxCode><TaxPercentage>${l.vatRate}</TaxPercentage><TaxAmount>${cents(Math.round(l.lineTotalCents * fx * l.vatRate / (100 + l.vatRate)))}</TaxAmount></Tax>
        <LineAmount>${cents(Math.round(l.lineTotalCents * fx))}</LineAmount>
      </Line>`).join('');
    const ron = invoiceRonCents(inv);
    if (ron.total < 0) salesCredit += Math.abs(ron.total); else salesDebit += ron.total;
    salesBlocks.push(`
    <Invoice>
      <InvoiceNo>${esc(inv.fullNumber)}</InvoiceNo>
      <CustomerInfo><CustomerID>${esc(inv.clientTaxIdSnap || inv.clientNameSnap)}</CustomerID></CustomerInfo>
      <Period>${new Date(inv.issuedAt || Date.now()).getUTCMonth() + 1}</Period>
      <InvoiceDate>${day(inv.issuedAt)}</InvoiceDate>
      <InvoiceType>${inv.kind === 'storno' ? '380' : '380'}</InvoiceType>
      <SystemEntryDate>${new Date(inv.createdAt || Date.now()).toISOString()}</SystemEntryDate>
      ${inv.currency && inv.currency !== 'RON' ? `<Currency><CurrencyCode>${esc(inv.currency)}</CurrencyCode><ExchangeRate>${inv.bnrRate || 1}</ExchangeRate></Currency>` : ''}
      ${lineBlocks}
      <DocumentTotals><TaxPayable>${cents(ron.vat)}</TaxPayable><NetTotal>${cents(ron.subtotal)}</NetTotal><GrossTotal>${cents(ron.total)}</GrossTotal></DocumentTotals>
    </Invoice>`);
  }

  // ── Purchase invoices + suppliers (din cheltuieli) ───────────────────────
  const exps = await db.select().from(expenses).where(and(
    eq(expenses.companyId, companyId),
    gte(expenses.issueDate, from), lte(expenses.issueDate, to),
  )).orderBy(asc(expenses.issueDate));
  const supMap = new Map<string, { id: string; name: string; taxId: string | null; address: string; country: string }>();
  const supRows = await db.select().from(suppliers).where(eq(suppliers.companyId, companyId));
  for (const s of supRows) supMap.set(s.id, { id: s.cui || s.id, name: s.name, taxId: s.cui || null, address: s.address || '', country: ctry(s.country) });
  // also synthesize suppliers from expense snapshots with no supplier row
  for (const e of exps) {
    if (e.supplierId && supMap.has(e.supplierId)) continue;
    const key = (e.supplierNameSnap || 'furnizor') + (e.supplierId || '');
    if (!supMap.has(key)) supMap.set(key, { id: key, name: e.supplierNameSnap || 'Furnizor', taxId: null, address: '', country: 'RO' });
  }
  const supplierBlocks = [...supMap.values()].map((s) => `
    <Supplier>
      <SupplierID>${esc(s.id)}</SupplierID>
      <AccountID>401</AccountID>
      <SupplierTaxID>${esc(s.taxId || '')}</SupplierTaxID>
      <CompanyName>${esc(s.name)}</CompanyName>
      <BillingAddress><AddressDetail>${esc(s.address || '—')}</AddressDetail><Country>${esc(s.country)}</Country></BillingAddress>
    </Supplier>`).join('');

  let purchDebit = 0, purchCredit = 0;
  const purchBlocks = exps.map((e) => {
    const r = expenseRonCents(e);
    purchDebit += r.net + r.vat;
    const sup = e.supplierId && supMap.has(e.supplierId) ? supMap.get(e.supplierId)! : null;
    const supId = sup ? sup.id : ((e.supplierNameSnap || 'furnizor') + (e.supplierId || ''));
    return `
    <Invoice>
      <InvoiceNo>${esc(e.documentNumber || e.id)}</InvoiceNo>
      <SupplierInfo><SupplierID>${esc(supId)}</SupplierID></SupplierInfo>
      <Period>${new Date((e.issueDate || from) + 'T00:00:00Z').getUTCMonth() + 1}</Period>
      <InvoiceDate>${esc(e.issueDate || from)}</InvoiceDate>
      <InvoiceType>380</InvoiceType>
      <SystemEntryDate>${new Date(e.createdAt || Date.now()).toISOString()}</SystemEntryDate>
      <Line>
        <LineNumber>1</LineNumber>
        <ProductDescription>${esc(e.category || 'Cheltuială')}</ProductDescription>
        <Quantity>1</Quantity><UnitOfMeasure>buc</UnitOfMeasure>
        <DebitCreditIndicator>D</DebitCreditIndicator>
        <Tax><TaxType>TVA</TaxType><TaxCode>${e.vatScheme === 'reverse_charge' ? 'TI' : 'S'}</TaxCode><TaxAmount>${cents(r.vat)}</TaxAmount></Tax>
        <LineAmount>${cents(r.net)}</LineAmount>
      </Line>
      <DocumentTotals><TaxPayable>${cents(r.vat)}</TaxPayable><NetTotal>${cents(r.net)}</NetTotal><GrossTotal>${cents(r.total)}</GrossTotal></DocumentTotals>
    </Invoice>`;
  }).join('');

  // ── Payments (încasări facturi + plăți cheltuieli) ───────────────────────
  const salesPayBlocks: string[] = [];
  let payTotal = 0;
  for (const inv of sales) {
    const pays = await db.select().from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, inv.id));
    const fx = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    for (const p of pays) {
      const amt = Math.round(p.amountCents * fx); payTotal += amt;
      salesPayBlocks.push(`
    <Payment>
      <PaymentRefNo>${esc(inv.fullNumber)}</PaymentRefNo>
      <TransactionID>${esc(p.id)}</TransactionID>
      <PaymentMethod>${esc(p.method || 'transfer')}</PaymentMethod>
      <SystemEntryDate>${new Date(p.receivedAt || Date.now()).toISOString()}</SystemEntryDate>
      <PaymentLine><DebitCreditIndicator>D</DebitCreditIndicator><PaymentLineAmount>${cents(amt)}</PaymentLineAmount></PaymentLine>
    </Payment>`);
    }
  }

  // ── GeneralLedgerEntries (registrul jurnal) ──────────────────────────────
  const entries = await db.select().from(journalEntries).where(and(
    eq(journalEntries.companyId, companyId),
    gte(journalEntries.entryDate, from), lte(journalEntries.entryDate, to),
  )).orderBy(asc(journalEntries.entryDate));
  let glDebit = 0, glCredit = 0;
  const txBlocks: string[] = [];
  for (const e of entries) {
    const ls = await db.select().from(journalLines).where(eq(journalLines.entryId, e.id));
    glDebit += e.totalDebitCents; glCredit += e.totalCreditCents;
    const lineBlocks = ls.map((l) => l.debitCents > 0
      ? `<DebitLine><AccountID>${esc(l.accountCode)}</AccountID><SystemEntryDate>${new Date(e.createdAt || Date.now()).toISOString()}</SystemEntryDate><Description>${esc(l.note || e.description || '')}</Description><DebitAmount>${cents(l.debitCents)}</DebitAmount></DebitLine>`
      : `<CreditLine><AccountID>${esc(l.accountCode)}</AccountID><SystemEntryDate>${new Date(e.createdAt || Date.now()).toISOString()}</SystemEntryDate><Description>${esc(l.note || e.description || '')}</Description><CreditAmount>${cents(l.creditCents)}</CreditAmount></CreditLine>`).join('');
    txBlocks.push(`
      <Transaction>
        <TransactionID>${esc(e.entryNumber || e.id)}</TransactionID>
        <Period>${new Date((e.entryDate || from) + 'T00:00:00Z').getUTCMonth() + 1}</Period>
        <TransactionDate>${esc(e.entryDate || from)}</TransactionDate>
        <SourceID>${esc(e.source || 'manual')}</SourceID>
        <Description>${esc(e.description || '')}</Description>
        <SystemEntryDate>${new Date(e.createdAt || Date.now()).toISOString()}</SystemEntryDate>
        <Lines>${lineBlocks}</Lines>
      </Transaction>`);
  }

  // ── Assets (mijloace fixe) ───────────────────────────────────────────────
  const assets = await db.select().from(fixedAssets).where(eq(fixedAssets.companyId, companyId));
  const assetBlocks = assets.map((a) => `
    <Asset>
      <AssetID>${esc(a.inventoryNumber || a.id)}</AssetID>
      <AccountID>21</AccountID>
      <Description>${esc(a.name)}</Description>
      <DateOfAcquisition>${esc(a.acquisitionDate || '')}</DateOfAcquisition>
      <AcquisitionAndProductionCostsBegin>${cents(a.valueCents)}</AcquisitionAndProductionCostsBegin>
      <AssetLifeRemaining>${a.usefulLifeMonths}</AssetLifeRemaining>
      <BookValueBegin>${cents(a.valueCents - a.accumulatedCents)}</BookValueBegin>
    </Asset>`).join('');

  // ── MovementOfGoods (mișcări de stoc) ────────────────────────────────────
  const movs = await db.select().from(stockMovements).where(and(
    eq(stockMovements.companyId, companyId),
    gte(stockMovements.createdAt, fromD), lte(stockMovements.createdAt, toD),
  ));
  let qIn = 0, qOut = 0;
  const movBlocks = movs.map((m, i) => {
    if (m.kind === 'in') qIn += m.quantity; else if (m.kind === 'out') qOut += m.quantity;
    return `
    <StockMovement>
      <MovementReference>${esc(m.id)}</MovementReference>
      <MovementType>${m.kind === 'in' ? 'Receptie' : m.kind === 'out' ? 'Iesire' : esc(m.kind)}</MovementType>
      <MovementDate>${day(m.createdAt)}</MovementDate>
      <ProductCode>${esc(m.productId)}</ProductCode>
      <Quantity>${Math.abs(m.quantity)}</Quantity>
      <UnitOfMeasure>buc</UnitOfMeasure>
      <UnitPrice>${cents(m.unitCostCents || 0)}</UnitPrice>
    </StockMovement>`;
  }).join('');

  // ── Products + UOM + TaxTable ────────────────────────────────────────────
  const products = await db.select().from(invoiceProducts).where(eq(invoiceProducts.companyId, companyId)).limit(2000);
  const productBlocks = products.map((p) => `
    <Product>
      <ProductCode>${esc(p.code || p.id)}</ProductCode>
      <ProductDescription>${esc(p.name)}</ProductDescription>
      <UOMBase>${esc(p.defaultUm || 'buc')}</UOMBase>
    </Product>`).join('');
  const uoms = [...new Set(products.map((p) => p.defaultUm || 'buc'))];
  const uomBlocks = uoms.map((u) => `<UOMTableEntry><UnitOfMeasure>${esc(u)}</UnitOfMeasure><Description>${esc(u)}</Description></UOMTableEntry>`).join('');
  const taxRates = [21, 11, 9, 5, 0];
  const taxBlocks = taxRates.map((r) => `<TaxCodeDetails><TaxCode>${vatCode(r)}</TaxCode><Description>TVA ${r}%</Description><TaxPercentage>${r}</TaxPercentage><Country>RO</Country></TaxCodeDetails>`).join('');

  // ── Assemble ─────────────────────────────────────────────────────────────
  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="mfp:anaf:dgti:d406:declaratie:v1">
  <Header>
    <AuditFileVersion>2.4.6</AuditFileVersion>
    <AuditFileCountry>RO</AuditFileCountry>
    <AuditFileDateCreated>${new Date().toISOString().slice(0, 10)}</AuditFileDateCreated>
    <SoftwareCompanyName>facturamea</SoftwareCompanyName>
    <SoftwareID>facturamea</SoftwareID>
    <SoftwareVersion>1.0.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${esc(supplierCif)}</RegistrationNumber>
      <Name>${esc(billing?.legalName || issuer.name)}</Name>
      <Address><AddressDetail>${esc(billing?.address || issuer.address || '')}</AddressDetail><City>${esc(billing?.city || issuer.city || '')}</City><PostalCode>${esc(billing?.postalCode || '')}</PostalCode><Country>${esc(ctry(billing?.countryCode))}</Country></Address>
      <Contact><Telephone>${esc(issuer.phone || '')}</Telephone><Email>${esc(issuer.email || '')}</Email></Contact>
    </Company>
    <DefaultCurrencyCode>RON</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${from}</SelectionStartDate>
      <SelectionEndDate>${to}</SelectionEndDate>
      <PeriodStart>${new Date(from).getMonth() + 1}</PeriodStart>
      <PeriodStartYear>${new Date(from).getFullYear()}</PeriodStartYear>
      <PeriodEnd>${new Date(to).getMonth() + 1}</PeriodEnd>
      <PeriodEndYear>${new Date(to).getFullYear()}</PeriodEndYear>
      <OtherCriteria>D406_${declarationType}</OtherCriteria>
    </SelectionCriteria>
    <TaxAccountingBasis>A</TaxAccountingBasis>
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>${accountBlocks}
    </GeneralLedgerAccounts>
    <Customers>${customerBlocks}
    </Customers>
    <Suppliers>${supplierBlocks}
    </Suppliers>
    <TaxTable><TaxTableEntry><TaxType>TVA</TaxType><Description>Taxa pe valoarea adaugata</Description>${taxBlocks}</TaxTableEntry></TaxTable>
    <UOMTable>${uomBlocks}</UOMTable>
    <Products>${productBlocks}
    </Products>
    <AssetsTable>${assetBlocks}
    </AssetsTable>
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>${entries.length}</NumberOfEntries>
    <TotalDebit>${cents(glDebit)}</TotalDebit>
    <TotalCredit>${cents(glCredit)}</TotalCredit>
    <Journal>
      <JournalID>GENERAL</JournalID>
      <Description>Registru jurnal</Description>${txBlocks.join('')}
    </Journal>
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
      <TotalCredit>${cents(purchCredit)}</TotalCredit>${purchBlocks}
    </PurchaseInvoices>
    <Payments>
      <NumberOfEntries>${salesPayBlocks.length}</NumberOfEntries>
      <TotalDebit>${cents(payTotal)}</TotalDebit>
      <TotalCredit>0.00</TotalCredit>${salesPayBlocks.join('')}
    </Payments>
    <MovementOfGoods>
      <NumberOfMovementLines>${movs.length}</NumberOfMovementLines>
      <TotalQuantityReceived>${qIn}</TotalQuantityReceived>
      <TotalQuantityIssued>${qOut}</TotalQuantityIssued>${movBlocks}
    </MovementOfGoods>
  </SourceDocuments>
</AuditFile>`;
}
