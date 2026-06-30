// Avansuri de trezorerie (cont 542). Self-provisions its table in prod so no
// migration run is needed. Balance per advance = granted − settled − returned.
import { db, treasuryAdvances } from '../db';
import { sql, eq, desc } from 'drizzle-orm';

export async function ensureAdvancesTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS treasury_advances (
    id text PRIMARY KEY,
    company_id text NOT NULL,
    employee_id text,
    employee_name varchar(200) NOT NULL,
    granted_date date NOT NULL,
    granted_cents integer NOT NULL,
    settled_cents integer NOT NULL DEFAULT 0,
    returned_cents integer NOT NULL DEFAULT 0,
    method varchar(16) DEFAULT 'cash',
    status varchar(16) NOT NULL DEFAULT 'open',
    settled_date date,
    notes text,
    created_at timestamp DEFAULT now()
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_treasury_advances_company ON treasury_advances (company_id)`);
}

export interface AdvanceRow {
  id: string;
  employeeName: string;
  grantedDate: string | null;
  grantedCents: number;
  settledCents: number;
  returnedCents: number;
  method: string | null;
  status: string;
  settledDate: string | null;
  notes: string | null;
  balanceCents: number;
}

export async function listAdvances(companyId: string): Promise<AdvanceRow[]> {
  await ensureAdvancesTable();
  const rows = await db.select().from(treasuryAdvances)
    .where(eq(treasuryAdvances.companyId, companyId))
    .orderBy(desc(treasuryAdvances.grantedDate));
  return rows.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    grantedDate: r.grantedDate,
    grantedCents: r.grantedCents || 0,
    settledCents: r.settledCents || 0,
    returnedCents: r.returnedCents || 0,
    method: r.method,
    status: r.status,
    settledDate: r.settledDate,
    notes: r.notes,
    balanceCents: (r.grantedCents || 0) - (r.settledCents || 0) - (r.returnedCents || 0),
  }));
}
