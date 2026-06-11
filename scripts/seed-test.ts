/**
 * Seed a ready-to-use TEST account for facturamea.
 *   Run:  DATABASE_URL="postgres://..." npx tsx scripts/seed-test.ts
 * Idempotent: if the demo user already exists, it only re-ensures the lifetime
 * license and exits.
 *
 * Login:  demo@facturamea.com  /  Demo1234!
 */
import { db } from '../src/db';
import {
  companies, users, invoiceSeries, invoiceClients, invoiceProducts,
  transportInvoices, transportInvoiceLines,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { hashPassword } from '../src/lib/auth';
import { generatePlatformId } from '../src/lib/platform-id';
import { grantLifetime } from '../src/lib/license';

const EMAIL = 'demo@facturamea.com';
const PASSWORD = 'Demo1234!';

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing?.companyId) {
    await grantLifetime(existing.companyId);
    console.log(`Demo user already exists (${EMAIL}). Lifetime license ensured. Done.`);
    return;
  }

  // Company
  const companyId = nanoid();
  await db.insert(companies).values({
    id: companyId,
    name: 'Demo Studio SRL',
    cui: 'RO45120033',
    country: 'Romania',
    city: 'București',
    phone: '0721 000 111',
    subscriptionTier: 'lifetime',
  } as any);

  // Owner user
  const userId = nanoid();
  const platformId = await generatePlatformId();
  const hashed = await hashPassword(PASSWORD);
  await db.insert(users).values({
    id: userId,
    platformId,
    email: EMAIL,
    emailVerified: true,
    hashedPassword: hashed,
    name: 'Demo Cont',
    userType: 'intermediar',
    companyId,
    phone: '0721 000 111',
    referralCode: platformId.replace(/^FM/i, '').toUpperCase(),
  } as any);

  // Lifetime license (no paywall)
  await grantLifetime(companyId, { amountCents: 70000 });

  // Default invoice series
  const seriesId = nanoid();
  await db.insert(invoiceSeries).values({
    id: seriesId, companyId, name: 'Facturi', prefix: 'FAC', kind: 'factura', nextNumber: 6, isDefault: true,
  } as any);

  // Clients
  const clients = [
    { id: nanoid(), ownerCompanyId: companyId, name: 'Alpha Tech SRL', taxId: 'RO12345678', isVatPayer: true, city: 'Cluj-Napoca', address: 'Str. Memorandumului 12', email: 'contact@alphatech.ro' },
    { id: nanoid(), ownerCompanyId: companyId, name: 'Beta Comerț SRL', taxId: 'RO87654321', isVatPayer: true, city: 'Timișoara', address: 'Bd. Take Ionescu 5', email: 'office@betacomert.ro' },
    { id: nanoid(), ownerCompanyId: companyId, name: 'Gamma Media SRL', taxId: 'RO11223344', isVatPayer: false, city: 'Iași', address: 'Str. Lăpușneanu 8', email: 'hello@gammamedia.ro' },
  ];
  await db.insert(invoiceClients).values(clients as any);

  // Products
  await db.insert(invoiceProducts).values([
    { id: nanoid(), companyId, code: 'CONS', name: 'Consultanță IT', defaultUnitPriceCents: 30000, defaultUm: 'oră', defaultVatRate: 21, productType: 'Servicii' },
    { id: nanoid(), companyId, code: 'SAAS', name: 'Abonament software', defaultUnitPriceCents: 120000, defaultUm: 'buc', defaultVatRate: 21, productType: 'Servicii' },
    { id: nanoid(), companyId, code: 'DEV', name: 'Dezvoltare web', defaultUnitPriceCents: 25000, defaultUm: 'oră', defaultVatRate: 21, productType: 'Servicii' },
  ] as any);

  // Invoices across statuses
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  type L = { desc: string; qty: number; price: number; vat: number };
  const mk = (seq: number, client: typeof clients[number], status: string, issuedDaysAgo: number, dueDaysFromIssue: number, lines: L[], paidRatio: number, kind = 'factura') => {
    let subtotal = 0, vat = 0;
    const lineRows = lines.map((l, i) => {
      const lineTotal = Math.round(l.price * l.qty);
      subtotal += lineTotal;
      vat += Math.round(lineTotal * (l.vat / 100));
      return { id: nanoid(), position: i, description: l.desc, quantity: l.qty, unit: 'buc', unitPriceCents: l.price, vatRate: l.vat, lineTotalCents: lineTotal };
    });
    const total = subtotal + vat;
    const issuedAt = new Date(now - issuedDaysAgo * day);
    const dueAt = new Date(issuedAt.getTime() + dueDaysFromIssue * day);
    const prefix = kind === 'proforma' ? 'PRO' : 'FAC';
    const invId = nanoid();
    return {
      invoice: {
        id: invId, companyId, issuedByUserId: userId, seriesId, sequenceNumber: seq,
        fullNumber: `${prefix}-${String(seq).padStart(4, '0')}`, kind,
        clientExternalId: client.id, clientNameSnap: client.name, clientTaxIdSnap: client.taxId, clientAddressSnap: client.address,
        currency: 'RON', subtotalCents: subtotal, vatCents: vat, totalCents: total,
        paidCents: Math.round(total * paidRatio), status, issuedAt, dueAt, language: 'ro', precision: 2,
      },
      lines: lineRows.map((r) => ({ ...r, invoiceId: invId })),
    };
  };

  const docs = [
    mk(1, clients[0], 'paid', 24, 15, [{ desc: 'Consultanță IT · ianuarie', qty: 10, price: 30000, vat: 21 }, { desc: 'Abonament software', qty: 1, price: 120000, vat: 21 }], 1),
    mk(2, clients[1], 'sent', 6, 30, [{ desc: 'Dezvoltare web', qty: 24, price: 25000, vat: 21 }], 0),
    mk(3, clients[2], 'overdue', 42, 15, [{ desc: 'Consultanță IT', qty: 6, price: 30000, vat: 21 }], 0),
    mk(4, clients[0], 'partial', 9, 30, [{ desc: 'Abonament software', qty: 2, price: 120000, vat: 21 }], 0.5),
    mk(5, clients[1], 'issued', 2, 30, [{ desc: 'Dezvoltare web · sprint', qty: 16, price: 25000, vat: 21 }], 0),
  ];

  for (const d of docs) {
    await db.insert(transportInvoices).values(d.invoice as any);
    await db.insert(transportInvoiceLines).values(d.lines as any);
  }

  console.log('✓ Demo account seeded.');
  console.log(`  Login: ${EMAIL}  /  ${PASSWORD}`);
  console.log(`  Company: Demo Studio SRL · platformId ${platformId} · lifetime license`);
  console.log(`  Data: 3 clients, 3 products, 5 documents (paid/sent/overdue/partial/issued).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
