import type { APIRoute } from 'astro';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db';
import {
  invoiceClients,
  invoiceProducts,
  invoiceSeries,
  transportInvoices,
  transportInvoiceLines,
  importJobs,
} from '../../../db/schema';
import { requireRole } from '../../../lib/require-role';
import {
  parseTabular,
  mapRow,
  moneyToCents,
  toNumber,
  toDate,
  normalizeInvoiceStatus,
  MAX_IMPORT_ROWS,
  type ImportEntity,
  type ImportSource,
} from '../../../lib/import-parsers';

const VALID_SOURCES: ImportSource[] = ['oblio', 'smartbill', 'fgo', 'csv'];
const VALID_ENTITIES: ImportEntity[] = ['clients', 'products', 'invoices'];

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ERROR_LOG_CAP = 12_000; // chars stored in import_jobs.error_log

interface RowError {
  row: number;
  message: string;
}

function clampStr(v: string | undefined | null, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Neautorizat' }), { status: 401 });
  }
  const denied = requireRole(locals, 'invoice.create'); if (denied) return denied;
  const companyId = locals.user.companyId;
  if (!companyId) {
    return new Response(JSON.stringify({ error: 'Companie lipsă' }), { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return new Response(JSON.stringify({ error: 'multipart/form-data invalid' }), { status: 400 });
  }

  const file = form.get('file') as File | null;
  const source = String(form.get('source') || 'csv') as ImportSource;
  const entity = String(form.get('entity') || 'clients') as ImportEntity;
  const mappingRaw = String(form.get('mapping') || '{}');

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: 'Fișier lipsă' }), { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return new Response(JSON.stringify({ error: 'Fișier prea mare' }), { status: 400 });
  }
  if (!VALID_SOURCES.includes(source)) {
    return new Response(JSON.stringify({ error: 'Sursă necunoscută' }), { status: 400 });
  }
  if (!VALID_ENTITIES.includes(entity)) {
    return new Response(JSON.stringify({ error: 'Entitate necunoscută' }), { status: 400 });
  }

  let mapping: Record<string, string>;
  try {
    mapping = JSON.parse(mappingRaw);
    if (typeof mapping !== 'object' || mapping === null) throw new Error('bad mapping');
  } catch {
    return new Response(JSON.stringify({ error: 'Mapare invalidă' }), { status: 400 });
  }

  // Parse the file.
  let rows: Record<string, string>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const parsed = await parseTabular(buf, file.name);
    rows = parsed.rows;
  } catch (err) {
    console.error('import commit parse failed', err);
    return new Response(JSON.stringify({ error: 'Nu am putut citi fișierul.' }), { status: 400 });
  }

  const totalRowsInFile = rows.length;
  const truncated = rows.length > MAX_IMPORT_ROWS;
  if (truncated) rows = rows.slice(0, MAX_IMPORT_ROWS);

  const errors: RowError[] = [];
  let imported = 0;

  try {
    if (entity === 'clients') {
      imported = await importClients(companyId, rows, mapping, errors);
    } else if (entity === 'products') {
      imported = await importProducts(companyId, rows, mapping, errors);
    } else {
      imported = await importInvoices(companyId, rows, mapping, errors);
    }
  } catch (err) {
    console.error('import commit failed', err);
    return new Response(
      JSON.stringify({ error: 'Eroare la import. Verifică datele și încearcă din nou.' }),
      { status: 500 },
    );
  }

  const errorRows = errors.length;

  // Build the persisted error log (capped).
  let errorLog: string | null = null;
  if (errors.length) {
    const lines = errors.map((e) => `Rând ${e.row}: ${e.message}`);
    if (truncated) {
      lines.unshift(
        `NOTĂ: fișierul avea ${totalRowsInFile} rânduri; au fost procesate primele ${MAX_IMPORT_ROWS}.`,
      );
    }
    errorLog = lines.join('\n').slice(0, ERROR_LOG_CAP);
  } else if (truncated) {
    errorLog = `NOTĂ: fișierul avea ${totalRowsInFile} rânduri; au fost procesate primele ${MAX_IMPORT_ROWS}.`;
  }

  // Record the job (best-effort; don't fail the response if logging fails).
  const jobId = nanoid();
  try {
    await db.insert(importJobs).values({
      id: jobId,
      companyId,
      source,
      entity,
      status: errorRows > 0 && imported === 0 ? 'failed' : 'done',
      totalRows: rows.length,
      importedRows: imported,
      errorRows,
      errorLog,
      createdByUserId: locals.user.id,
    });
  } catch (err) {
    console.error('import job log failed', err);
  }

  return new Response(
    JSON.stringify({
      jobId,
      importedRows: imported,
      errorRows,
      totalRows: rows.length,
      truncated,
      sourceRowCount: totalRowsInFile,
      errors: errors.slice(0, 50),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

// ─── Clients ──────────────────────────────────────────────────────────────────

async function importClients(
  companyId: string,
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  errors: RowError[],
): Promise<number> {
  const values: (typeof invoiceClients.$inferInsert)[] = [];
  rows.forEach((row, i) => {
    const m = mapRow(row, mapping);
    const name = clampStr(m.name, 200);
    if (!name) {
      errors.push({ row: i + 2, message: 'Denumire lipsă' });
      return;
    }
    values.push({
      id: nanoid(),
      ownerCompanyId: companyId,
      name,
      taxId: clampStr(m.taxId, 32),
      registryNumber: clampStr(m.registryNumber, 50),
      country: clampStr(m.country, 60) || 'Romania',
      county: clampStr(m.county, 60),
      city: clampStr(m.city, 80),
      address: clampStr(m.address, 4000),
      postalCode: clampStr(m.postalCode, 20),
      contactName: clampStr(m.contactName, 120),
      email: clampStr(m.email, 160),
      phone: clampStr(m.phone, 32),
      iban: clampStr(m.iban, 40),
      bank: clampStr(m.bank, 80),
    });
  });

  if (!values.length) return 0;
  // Insert in chunks to keep statements bounded.
  let inserted = 0;
  for (const chunk of chunks(values, 200)) {
    await db.insert(invoiceClients).values(chunk);
    inserted += chunk.length;
  }
  return inserted;
}

// ─── Products ───────────────────────────────────────────────────────────────

async function importProducts(
  companyId: string,
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  errors: RowError[],
): Promise<number> {
  const values: (typeof invoiceProducts.$inferInsert)[] = [];
  rows.forEach((row, i) => {
    const m = mapRow(row, mapping);
    const name = clampStr(m.name, 300);
    if (!name) {
      errors.push({ row: i + 2, message: 'Denumire lipsă' });
      return;
    }
    const vat = toNumber(m.defaultVatRate);
    values.push({
      id: nanoid(),
      companyId,
      name,
      code: clampStr(m.code, 64),
      description: clampStr(m.description, 4000),
      defaultUnitPriceCents: moneyToCents(m.defaultUnitPriceCents),
      defaultCurrency: clampStr(m.defaultCurrency, 5) || 'RON',
      defaultUm: clampStr(m.defaultUm, 16) || 'buc',
      defaultVatRate: vat ?? 19,
      productType: clampStr(m.productType, 40) || 'Servicii',
      isActive: true,
    });
  });

  if (!values.length) return 0;
  let inserted = 0;
  for (const chunk of chunks(values, 200)) {
    await db.insert(invoiceProducts).values(chunk);
    inserted += chunk.length;
  }
  return inserted;
}

// ─── Invoices (history) ─────────────────────────────────────────────────────
// Imported documents land on a synthetic "IMPORT" series so they never collide
// with live numbering. fullNumber is taken from the source document number;
// when a row carries line columns we insert one line, otherwise a single
// summary line covering the document total.

async function importInvoices(
  companyId: string,
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  errors: RowError[],
): Promise<number> {
  const series = await ensureImportSeries(companyId);

  // Determine the next sequence number on the IMPORT series so re-imports keep
  // counting up (the (seriesId, sequenceNumber) pair is unique).
  let seq = series.nextNumber || 1;

  let imported = 0;
  for (let i = 0; i < rows.length; i++) {
    const m = mapRow(rows[i], mapping);

    const clientName = clampStr(m.clientName, 200);
    const docNumber = clampStr(m.number, 64);
    if (!clientName) {
      errors.push({ row: i + 2, message: 'Client lipsă' });
      continue;
    }
    if (!docNumber) {
      errors.push({ row: i + 2, message: 'Număr document lipsă' });
      continue;
    }

    const seriesPrefix = clampStr(m.series, 16);
    const fullNumber = (seriesPrefix ? `${seriesPrefix} ${docNumber}` : docNumber).slice(0, 64);

    // Money.
    let total = moneyToCents(m.total);
    let subtotal = moneyToCents(m.subtotal);
    let vat = moneyToCents(m.vat);
    const paid = moneyToCents(m.paid);

    // Backfill missing money fields where possible.
    if (total === null && subtotal !== null) total = subtotal + (vat ?? 0);
    if (subtotal === null && total !== null) subtotal = total - (vat ?? 0);
    if (subtotal === null) subtotal = 0;
    if (vat === null) vat = (total ?? subtotal) - subtotal;
    if (total === null) total = subtotal + vat;
    if (vat < 0) vat = 0;

    const currency = clampStr(m.currency, 5) || 'RON';
    const issuedAt = toDate(m.issuedAt);
    const dueAt = toDate(m.dueAt);
    const status = normalizeInvoiceStatus(m.status);
    const paidCents = status === 'paid' ? (paid ?? total) : (paid ?? 0);

    const invoiceId = nanoid();
    try {
      await db.insert(transportInvoices).values({
        id: invoiceId,
        companyId,
        seriesId: series.id,
        sequenceNumber: seq,
        fullNumber,
        kind: 'factura',
        clientNameSnap: clientName,
        clientTaxIdSnap: clampStr(m.clientTaxId, 32),
        clientAddressSnap: clampStr(m.clientAddress, 4000),
        currency,
        subtotalCents: subtotal,
        vatCents: vat,
        totalCents: total,
        paidCents,
        status,
        issuedAt: issuedAt ?? undefined,
        dueAt: dueAt ?? undefined,
        paidAt: status === 'paid' ? (issuedAt ?? new Date()) : undefined,
      });

      // Line: from the row's product columns if present, else a summary line.
      const lineDesc = clampStr(m.description, 4000);
      const qty = toNumber(m.quantity);
      const unitPrice = moneyToCents(m.unitPrice);
      const lineVat = toNumber(m.vatRate);

      if (lineDesc || qty !== null || unitPrice !== null) {
        const q = qty ?? 1;
        const up = unitPrice ?? (q ? Math.round(subtotal / q) : subtotal);
        await db.insert(transportInvoiceLines).values({
          id: nanoid(),
          invoiceId,
          position: 0,
          description: lineDesc || 'Produs / serviciu importat',
          quantity: q,
          unit: clampStr(m.unit, 16) || 'buc',
          unitPriceCents: up,
          vatRate: lineVat ?? (subtotal > 0 ? Math.round((vat / subtotal) * 100) : 0),
          lineTotalCents: subtotal,
        });
      } else {
        await db.insert(transportInvoiceLines).values({
          id: nanoid(),
          invoiceId,
          position: 0,
          description: `Factura importată ${fullNumber}`,
          quantity: 1,
          unit: 'buc',
          unitPriceCents: subtotal,
          vatRate: subtotal > 0 ? Math.round((vat / subtotal) * 100) : 0,
          lineTotalCents: subtotal,
        });
      }

      seq++;
      imported++;
    } catch (err: any) {
      errors.push({
        row: i + 2,
        message: `Nu s-a putut salva factura ${fullNumber}: ${err?.message || 'eroare necunoscută'}`.slice(0, 300),
      });
    }
  }

  // Advance the series counter so future imports continue numbering.
  if (imported > 0) {
    try {
      await db
        .update(invoiceSeries)
        .set({ nextNumber: seq })
        .where(and(eq(invoiceSeries.id, series.id), eq(invoiceSeries.companyId, companyId)));
    } catch {
      /* non-fatal */
    }
  }

  return imported;
}

// Find-or-create the per-company "IMPORT" factura series.
async function ensureImportSeries(
  companyId: string,
): Promise<{ id: string; nextNumber: number }> {
  const [existing] = await db
    .select({ id: invoiceSeries.id, nextNumber: invoiceSeries.nextNumber })
    .from(invoiceSeries)
    .where(
      and(
        eq(invoiceSeries.companyId, companyId),
        eq(invoiceSeries.prefix, 'IMPORT'),
        eq(invoiceSeries.kind, 'factura'),
      ),
    )
    .limit(1);
  if (existing) return { id: existing.id, nextNumber: existing.nextNumber || 1 };

  const id = nanoid();
  await db.insert(invoiceSeries).values({
    id,
    companyId,
    name: 'Documente importate',
    prefix: 'IMPORT',
    kind: 'factura',
    nextNumber: 1,
    isDefault: false,
  });
  return { id, nextNumber: 1 };
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}
