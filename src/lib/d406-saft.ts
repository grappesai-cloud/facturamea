// D406 SAF-T (Standard Audit File for Tax) XML generator.
//
// SAF-T RO is the ANAF-mandated annual fiscal report. The schema is based
// on OECD SAF-T 2.0 with RO extensions. This generator produces the
// MasterFiles + SourceDocuments → SalesInvoices sections — enough to
// satisfy the invoicing subset most carriers need.
//
// Output is a UTF-8 XML string. Caller writes it to a file or returns it
// via the download endpoint; ANAF requires sending the .zip-packaged
// final XML through SPV.
//
// NOTE: This is a tax-grade exporter but ANAF schema versions move; the
// final output should be validated against the latest XSD in production.

import { db } from '../db';
import { transportInvoices, transportInvoiceLines, transportInvoicePayments, companies, billingAddresses, invoiceClients } from '../db/schema';
import { and, eq, gte, lte, ne, asc, inArray } from 'drizzle-orm';
import { invoiceRonCents } from './invoicing';

interface D406Args {
  companyId: string;
  /** Period start, inclusive (YYYY-MM-DD) */
  from: string;
  /** Period end, inclusive (YYYY-MM-DD) */
  to: string;
  /** 'L' (monthly) | 'T' (quarterly) | 'A' (yearly) | 'C' (on demand) */
  declarationType?: 'L' | 'T' | 'A' | 'C';
}

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));

const cents = (c: number) => (c / 100).toFixed(2);

export async function generateD406Xml(args: D406Args): Promise<string> {
  const { companyId, from, to, declarationType = 'L' } = args;

  const [issuer] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!issuer) throw new Error('Issuer company not found');
  const [billing] = await db.select().from(billingAddresses).where(eq(billingAddresses.companyId, companyId));

  // Pull invoices in window. Include both facturi and storno credit notes so a
  // cancellation appears in SAF-T (the storno carries negative amounts and nets
  // the original to zero). Exclude only 'voided' (discarded drafts); a stornoed
  // original keeps status 'reversed' and must remain in the file.
  const invoices = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId),
    inArray(transportInvoices.kind, ['factura', 'storno']),
    ne(transportInvoices.status, 'voided'),
    gte(transportInvoices.issuedAt, new Date(from + 'T00:00:00Z')),
    lte(transportInvoices.issuedAt, new Date(to + 'T23:59:59Z')),
  )).orderBy(asc(transportInvoices.issuedAt));

  // Collect customer master file (unique by tax id).
  const customers = new Map<string, { id: string; name: string; taxId: string | null; address?: string; country?: string }>();
  for (const inv of invoices) {
    const key = inv.clientTaxIdSnap || inv.clientNameSnap;
    if (!customers.has(key)) {
      let country = 'RO';
      let address = inv.clientAddressSnap || '';
      if (inv.clientExternalId) {
        const [c] = await db.select().from(invoiceClients).where(eq(invoiceClients.id, inv.clientExternalId));
        if (c) {
          country = (c.country || 'Romania').toLowerCase().startsWith('rom') ? 'RO' : (c.country || 'RO').slice(0, 2).toUpperCase();
          address = c.address || address;
        }
      }
      customers.set(key, {
        id: key, name: inv.clientNameSnap,
        taxId: inv.clientTaxIdSnap || null,
        address, country,
      });
    }
  }

  // Build SalesInvoices.
  const invoiceBlocks: string[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const inv of invoices) {
    const lines = await db.select().from(transportInvoiceLines)
      .where(eq(transportInvoiceLines.invoiceId, inv.id))
      .orderBy(asc(transportInvoiceLines.position));
    const payments = await db.select().from(transportInvoicePayments).where(eq(transportInvoicePayments.invoiceId, inv.id));

    // SAF-T reports in RON: convert each line (and payment) at the invoice rate so
    // the line amounts reconcile with the RON DocumentTotals below.
    const fx = inv.currency && inv.currency !== 'RON' ? (Number(inv.bnrRate) || 1) : 1;
    const lineBlocks = lines.map((l) => `
      <Line>
        <LineNumber>${l.position + 1}</LineNumber>
        <ProductCode>${esc('SRV')}</ProductCode>
        <ProductDescription>${esc(l.description)}</ProductDescription>
        <Quantity>${l.quantity}</Quantity>
        <UnitOfMeasure>${esc(l.unit)}</UnitOfMeasure>
        <UnitPrice>${cents(Math.round(l.unitPriceCents * fx))}</UnitPrice>
        <TaxPointDate>${(inv.issuedAt || new Date()).toISOString().slice(0, 10)}</TaxPointDate>
        <References><Reference><Description>Factura ${esc(inv.fullNumber)}</Description></Reference></References>
        <DebitCreditIndicator>${l.lineTotalCents >= 0 ? 'D' : 'C'}</DebitCreditIndicator>
        <Tax>
          <TaxType>VAT</TaxType>
          <TaxCode>${l.vatRate === 0 ? 'SDD' : l.vatRate === 9 ? 'Redusa' : l.vatRate === 5 ? 'Redusa5' : 'Normala'}</TaxCode>
          <TaxPercentage>${l.vatRate}</TaxPercentage>
          <TaxAmount>${cents(Math.round(l.lineTotalCents * fx * l.vatRate / (100 + l.vatRate)))}</TaxAmount>
        </Tax>
        <LineAmount>${cents(Math.round(l.lineTotalCents * fx))}</LineAmount>
      </Line>`).join('');

    const paymentBlocks = payments.map((p) => `
      <Payment>
        <PaymentMechanism>${esc(p.method || 'transfer')}</PaymentMechanism>
        <PaymentAmount>${cents(Math.round(p.amountCents * fx))}</PaymentAmount>
        <PaymentDate>${new Date(p.receivedAt).toISOString().slice(0, 10)}</PaymentDate>
      </Payment>`).join('');

    // SAF-T totals are in the company default currency (RON), with the original
    // currency + ExchangeRate shown in the Currency element below.
    const ron = invoiceRonCents(inv);
    const isCredit = ron.total < 0;
    if (isCredit) totalCredit += Math.abs(ron.total); else totalDebit += ron.total;

    invoiceBlocks.push(`
    <Invoice>
      <InvoiceNo>${esc(inv.fullNumber)}</InvoiceNo>
      <InvoiceDate>${(inv.issuedAt || new Date()).toISOString().slice(0, 10)}</InvoiceDate>
      <CustomerID>${esc(inv.clientTaxIdSnap || inv.clientNameSnap)}</CustomerID>
      <Period>${new Date(inv.issuedAt || Date.now()).getMonth() + 1}</Period>
      <SourceID>${esc(inv.issuedByUserId || '')}</SourceID>
      <SystemEntryDate>${new Date(inv.createdAt || Date.now()).toISOString()}</SystemEntryDate>
      <Currency>
        <CurrencyCode>${esc(inv.currency || 'RON')}</CurrencyCode>
        ${inv.bnrRate ? `<ExchangeRate>${inv.bnrRate}</ExchangeRate>` : ''}
      </Currency>
      ${lineBlocks}
      <DocumentTotals>
        <TaxPayable>${cents(ron.vat)}</TaxPayable>
        <NetTotal>${cents(ron.subtotal)}</NetTotal>
        <GrossTotal>${cents(ron.total)}</GrossTotal>
        ${paymentBlocks}
      </DocumentTotals>
    </Invoice>`);
  }

  const customerBlocks = Array.from(customers.values()).map((c) => `
    <Customer>
      <CustomerID>${esc(c.id)}</CustomerID>
      <AccountID>${esc(c.taxId || c.id)}</AccountID>
      <CustomerTaxID>${esc(c.taxId || '')}</CustomerTaxID>
      <CompanyName>${esc(c.name)}</CompanyName>
      <BillingAddress>
        <AddressDetail>${esc(c.address || '—')}</AddressDetail>
        <Country>${esc(c.country || 'RO')}</Country>
      </BillingAddress>
    </Customer>`).join('');

  const supplierCif = (issuer.cui || '').replace(/^RO/i, '').replace(/\D/g, '');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="mfp:anaf:dgti:d406:declaratie:v1">
  <Header>
    <AuditFileVersion>2.4.6</AuditFileVersion>
    <AuditFileCountry>RO</AuditFileCountry>
    <AuditFileRegion>RO</AuditFileRegion>
    <AuditFileDateCreated>${new Date().toISOString().slice(0, 10)}</AuditFileDateCreated>
    <SoftwareCompanyName>facturamea</SoftwareCompanyName>
    <SoftwareID>facturamea.Invoicing</SoftwareID>
    <SoftwareVersion>1.0.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${esc(supplierCif)}</RegistrationNumber>
      <Name>${esc(billing?.legalName || issuer.name)}</Name>
      <Address>
        <AddressDetail>${esc(billing?.address || issuer.address || '')}</AddressDetail>
        <City>${esc(billing?.city || issuer.city || '')}</City>
        <PostalCode>${esc(billing?.postalCode || '')}</PostalCode>
        <Country>${esc(billing?.countryCode || 'RO')}</Country>
      </Address>
      <Contact>
        <Telephone>${esc(issuer.phone || '')}</Telephone>
        <Email>${esc(issuer.email || '')}</Email>
      </Contact>
    </Company>
    <DefaultCurrencyCode>RON</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${from}</SelectionStartDate>
      <SelectionEndDate>${to}</SelectionEndDate>
      <PeriodStart>${new Date(from).getMonth() + 1}</PeriodStart>
      <PeriodStartYear>${new Date(from).getFullYear()}</PeriodStartYear>
      <PeriodEnd>${new Date(to).getMonth() + 1}</PeriodEnd>
      <PeriodEndYear>${new Date(to).getFullYear()}</PeriodEndYear>
      <DocumentType>F</DocumentType>
      <OtherCriteria>D406_${declarationType}</OtherCriteria>
    </SelectionCriteria>
    <HeaderComment>D406 SAF-T export from facturamea invoicing module</HeaderComment>
    <TaxAccountingBasis>F</TaxAccountingBasis>
  </Header>
  <MasterFiles>
    <Customers>${customerBlocks}
    </Customers>
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${invoices.length}</NumberOfEntries>
      <TotalDebit>${cents(totalDebit)}</TotalDebit>
      <TotalCredit>${cents(totalCredit)}</TotalCredit>${invoiceBlocks.join('')}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`;

  return xml;
}
