/**
 * Seed TWO ready-to-use accounts into a LOCAL sandbox DB for full UI testing:
 *   1. VAT payer        — tva@demo.com  / Demo1234!   (Demo TVA SRL, 21% VAT)
 *   2. Non-VAT payer    — fara@demo.com / Demo1234!   (Demo Fara TVA SRL, 0%)
 *
 *   Run: DATABASE_URL="postgres://localhost:5432/facturamea_demo" npx tsx scripts/seed-sandbox.ts
 * Idempotent-ish: wipes both accounts (by email) first, then recreates them.
 */
import { db } from '../src/db';
import {
  companies, users, invoiceSeries, invoiceClients, invoiceProducts,
  transportInvoices, transportInvoiceLines, expenses,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword } from '../src/lib/auth';
import { generatePlatformId } from '../src/lib/platform-id';
import { grantLifetime } from '../src/lib/license';

const PASSWORD = 'Demo1234!';
const day = 24 * 60 * 60 * 1000;
const now = Date.now();

async function seedCompany(opts: {
  email: string; companyName: string; cui: string; isVatPayer: boolean; vatRate: number; prefix: string;
}) {
  const { email, companyName, cui, isVatPayer, vatRate, prefix } = opts;

  // Clean any prior run for this email.
  const prior = await db.select().from(users).where(eq(users.email, email));
  for (const p of prior) {
    if (p.companyId) {
      await db.delete(companies).where(eq(companies.id, p.companyId)); // cascade removes children
    }
    await db.delete(users).where(eq(users.id, p.id));
  }

  const companyId = nanoid();
  await db.insert(companies).values({
    id: companyId,
    name: companyName,
    cui,
    regCom: 'J40/1234/2020',
    country: 'Romania',
    address: 'Str. Exemplu nr. 1',
    city: 'București',
    county: 'București',
    phone: '0721 000 111',
    email,
    iban: 'RO49AAAA1B31007593840000',
    bank: 'Banca Demo',
    isVatPayer,
    subscriptionTier: 'lifetime',
  } as any);

  const userId = nanoid();
  const platformId = await generatePlatformId();
  const hashed = await hashPassword(PASSWORD);
  await db.insert(users).values({
    id: userId,
    platformId,
    email,
    emailVerified: true,
    hashedPassword: hashed,
    name: companyName.replace(/ SRL$/, ''),
    userType: 'intermediar',
    companyId,
    phone: '0721 000 111',
    referralCode: platformId.replace(/^FM/i, '').toUpperCase(),
  } as any);

  await grantLifetime(companyId, { amountCents: 80000 });

  const seriesId = nanoid();
  await db.insert(invoiceSeries).values({
    id: seriesId, companyId, name: 'Facturi', prefix, kind: 'factura', nextNumber: 6, isDefault: true,
  } as any);

  const clients = [
    { id: nanoid(), ownerCompanyId: companyId, name: 'Alpha Tech SRL', taxId: 'RO12345678', isVatPayer: true, city: 'Cluj-Napoca', address: 'Str. Memorandumului 12', email: 'contact@alphatech.ro' },
    { id: nanoid(), ownerCompanyId: companyId, name: 'Beta Comerț SRL', taxId: 'RO87654321', isVatPayer: true, city: 'Timișoara', address: 'Bd. Take Ionescu 5', email: 'office@betacomert.ro' },
    { id: nanoid(), ownerCompanyId: companyId, name: 'Gamma Media SRL', taxId: 'RO11223344', isVatPayer: false, city: 'Iași', address: 'Str. Lăpușneanu 8', email: 'hello@gammamedia.ro' },
  ];
  await db.insert(invoiceClients).values(clients as any);

  await db.insert(invoiceProducts).values([
    { id: nanoid(), companyId, code: 'CONS', name: 'Consultanță IT', defaultUnitPriceCents: 30000, defaultUm: 'oră', defaultVatRate: vatRate, productType: 'Servicii' },
    { id: nanoid(), companyId, code: 'SAAS', name: 'Abonament software', defaultUnitPriceCents: 120000, defaultUm: 'buc', defaultVatRate: vatRate, productType: 'Servicii' },
    { id: nanoid(), companyId, code: 'DEV', name: 'Dezvoltare web', defaultUnitPriceCents: 25000, defaultUm: 'oră', defaultVatRate: vatRate, productType: 'Servicii' },
  ] as any);

  type L = { desc: string; qty: number; price: number };
  const mk = (seq: number, client: typeof clients[number], status: string, issuedDaysAgo: number, dueDaysFromIssue: number, lines: L[], paidRatio: number) => {
    let subtotal = 0, vat = 0;
    const lineRows = lines.map((l, i) => {
      const lineTotal = Math.round(l.price * l.qty);
      subtotal += lineTotal;
      vat += Math.round(lineTotal * (vatRate / 100));
      return { id: nanoid(), position: i, description: l.desc, quantity: l.qty, unit: 'buc', unitPriceCents: l.price, vatRate, lineTotalCents: lineTotal + Math.round(lineTotal * (vatRate / 100)) };
    });
    const total = subtotal + vat;
    const issuedAt = new Date(now - issuedDaysAgo * day);
    const dueAt = new Date(issuedAt.getTime() + dueDaysFromIssue * day);
    const invId = nanoid();
    return {
      invoice: {
        id: invId, companyId, issuedByUserId: userId, seriesId, sequenceNumber: seq,
        fullNumber: `${prefix}-${String(seq).padStart(4, '0')}`, kind: 'factura',
        clientExternalId: client.id, clientNameSnap: client.name, clientTaxIdSnap: client.taxId, clientAddressSnap: client.address,
        currency: 'RON', subtotalCents: subtotal, vatCents: vat, totalCents: total,
        paidCents: Math.round(total * paidRatio), status, issuedAt, dueAt, language: 'ro', precision: 2,
      },
      lines: lineRows.map((r) => ({ ...r, invoiceId: invId })),
    };
  };

  const docs = [
    mk(1, clients[0], 'paid', 24, 15, [{ desc: 'Consultanță IT · ianuarie', qty: 10, price: 30000 }, { desc: 'Abonament software', qty: 1, price: 120000 }], 1),
    mk(2, clients[1], 'sent', 6, 30, [{ desc: 'Dezvoltare web', qty: 24, price: 25000 }], 0),
    mk(3, clients[2], 'overdue', 42, 15, [{ desc: 'Consultanță IT', qty: 6, price: 30000 }], 0),
    mk(4, clients[0], 'partial', 9, 30, [{ desc: 'Abonament software', qty: 2, price: 120000 }], 0.5),
    mk(5, clients[1], 'issued', 2, 30, [{ desc: 'Dezvoltare web · sprint', qty: 16, price: 25000 }], 0),
  ];
  for (const d of docs) {
    await db.insert(transportInvoices).values(d.invoice as any);
    await db.insert(transportInvoiceLines).values(d.lines as any);
  }

  // A few expenses so the cheltuieli / contabilitate pages have data.
  const exp = (supplier: string, cat: string, net: number, daysAgo: number) => ({
    id: nanoid(), companyId, supplierNameSnap: supplier, category: cat, documentType: 'factura',
    documentNumber: `F${1000 + Math.round(net / 100)}`, issueDate: new Date(now - daysAgo * day).toISOString().slice(0, 10),
    currency: 'RON', netCents: net, vatCents: Math.round(net * (vatRate / 100)), totalCents: net + Math.round(net * (vatRate / 100)),
    status: 'unpaid', deductible: true, deductiblePct: 100,
  });
  await db.insert(expenses).values([
    exp('Enel Energie SA', 'utilitati', 45000, 12),
    exp('Orange Romania SA', 'utilitati', 12000, 8),
    exp('Digi Mobil', 'servicii', 8000, 20),
  ] as any);

  return { email, companyName, platformId, isVatPayer };
}

async function main() {
  const a = await seedCompany({ email: 'tva@demo.com', companyName: 'Demo TVA SRL', cui: 'RO45120033', isVatPayer: true, vatRate: 21, prefix: 'TVA' });
  const b = await seedCompany({ email: 'fara@demo.com', companyName: 'Demo Fara TVA SRL', cui: '45120099', isVatPayer: false, vatRate: 0, prefix: 'FFA' });
  console.log('✓ Sandbox seeded with two accounts:');
  for (const c of [a, b]) {
    console.log(`  • ${c.email} / ${PASSWORD} — ${c.companyName} (${c.isVatPayer ? 'PLĂTITOR TVA 21%' : 'NEPLĂTITOR TVA'})`);
  }
  console.log('  Each: 3 clients, 3 products, 5 invoices (paid/sent/overdue/partial/issued), 3 expenses, lifetime license.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
