// TVA neexigibilă (cont 4428) — for invoices under the "TVA la încasare" regime,
// VAT becomes chargeable only as the invoice is collected. This surfaces, per
// invoice, the total VAT, the part already collected (reclassed to 4427) and the
// part still pending (in 4428). The ledger postings are produced by postInvoice /
// postPayment; this report just makes the position visible + reconciles with 4428.
import { db } from '../db';
import { transportInvoices } from '../db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { invoiceRonCents } from './invoicing';

export interface VatNeexItem {
  doc: string;
  partner: string;
  date: string;
  totalVatCents: number;
  collectedVatCents: number;
  neexigibilVatCents: number;
  paidRatioPct: number;
}
export interface VatNeexReport {
  items: VatNeexItem[];
  totalVatCents: number;
  collectedVatCents: number;
  neexigibilVatCents: number;
}

export async function collectVatNeexigibila(companyId: string): Promise<VatNeexReport> {
  const invs = await db.select().from(transportInvoices).where(and(
    eq(transportInvoices.companyId, companyId),
    ne(transportInvoices.status, 'voided'),
    ne(transportInvoices.status, 'draft'),
  )).catch(() => [] as any[]);

  const items: VatNeexItem[] = [];
  let totVat = 0; let totCollected = 0; let totNeex = 0;
  for (const inv of invs) {
    const cashVat = !!inv.vatAtCollection || inv.vatRegime === 'tva_la_incasare';
    if (!cashVat || inv.kind !== 'factura') continue;
    const vatRon = invoiceRonCents(inv).vat;
    if (vatRon <= 0) continue;
    const total = inv.totalCents || 0;
    const paid = Math.min(inv.paidCents || 0, total);
    const collected = total > 0 ? Math.min(vatRon, Math.round((paid * vatRon) / total)) : 0;
    const neex = vatRon - collected;
    if (neex === 0 && collected === vatRon) continue; // fully collected — nothing pending
    items.push({
      doc: inv.fullNumber || inv.id.slice(0, 8),
      partner: inv.clientNameSnap || '',
      date: String(inv.issuedAt instanceof Date ? inv.issuedAt.toISOString() : inv.issuedAt || '').slice(0, 10),
      totalVatCents: vatRon, collectedVatCents: collected, neexigibilVatCents: neex,
      paidRatioPct: total > 0 ? Math.round((paid / total) * 100) : 0,
    });
    totVat += vatRon; totCollected += collected; totNeex += neex;
  }
  items.sort((a, b) => b.neexigibilVatCents - a.neexigibilVatCents);
  return { items, totalVatCents: totVat, collectedVatCents: totCollected, neexigibilVatCents: totNeex };
}
