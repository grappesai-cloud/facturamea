// Support / contact inbox. Messages from the in-app "Ajutor" sheet and the
// public /contact form land here and surface ONLY in the admin panel
// (/admin/mesaje) — no email is sent anywhere. The table is self-provisioning
// (CREATE TABLE IF NOT EXISTS) so it works on prod without a migration run.
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type SupportSource = 'app' | 'contact';
export type SupportStatus = 'new' | 'resolved';

export interface SupportMessage {
  id: string;
  userId: string | null;
  companyId: string | null;
  name: string | null;
  email: string | null;
  topic: string | null;
  message: string;
  source: SupportSource;
  status: SupportStatus;
  createdAt: string | Date | null;
  resolvedAt: string | Date | null;
}

export async function ensureSupportTable() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS support_messages (
    id text PRIMARY KEY,
    user_id text,
    company_id text,
    name varchar(200),
    email varchar(200),
    topic varchar(80),
    message text NOT NULL,
    source varchar(16) NOT NULL DEFAULT 'app',
    status varchar(16) NOT NULL DEFAULT 'new',
    user_agent text,
    created_at timestamp DEFAULT now(),
    resolved_at timestamp,
    resolved_by_user_id text
  )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_support_messages_status ON support_messages (status, created_at)`);
}

export async function createSupportMessage(input: {
  message: string;
  email?: string | null;
  name?: string | null;
  topic?: string | null;
  source: SupportSource;
  userId?: string | null;
  companyId?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  await ensureSupportTable();
  const id = nanoid();
  const msg = input.message.trim().slice(0, 5000);
  await db.execute(sql`INSERT INTO support_messages
    (id, user_id, company_id, name, email, topic, message, source, status, user_agent)
    VALUES (
      ${id}, ${input.userId ?? null}, ${input.companyId ?? null},
      ${input.name?.trim()?.slice(0, 200) || null}, ${input.email?.trim()?.slice(0, 200) || null},
      ${input.topic?.trim()?.slice(0, 80) || null}, ${msg}, ${input.source}, 'new',
      ${input.userAgent?.slice(0, 400) || null}
    )`);
  return id;
}

export async function listSupportMessages(status?: SupportStatus): Promise<SupportMessage[]> {
  await ensureSupportTable();
  const rows = status
    ? await db.execute(sql`SELECT * FROM support_messages WHERE status = ${status} ORDER BY created_at DESC LIMIT 500`)
    : await db.execute(sql`SELECT * FROM support_messages ORDER BY (status='new') DESC, created_at DESC LIMIT 500`);
  return (rows.rows as any[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    companyId: r.company_id,
    name: r.name,
    email: r.email,
    topic: r.topic,
    message: r.message,
    source: r.source,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

export async function countNewSupport(): Promise<number> {
  await ensureSupportTable();
  const r = await db.execute(sql`SELECT COUNT(*)::int AS n FROM support_messages WHERE status = 'new'`);
  return Number((r.rows as any[])[0]?.n || 0);
}

export async function setSupportStatus(id: string, status: SupportStatus, byUserId?: string | null) {
  await ensureSupportTable();
  if (status === 'resolved') {
    await db.execute(sql`UPDATE support_messages SET status = 'resolved', resolved_at = now(), resolved_by_user_id = ${byUserId ?? null} WHERE id = ${id}`);
  } else {
    await db.execute(sql`UPDATE support_messages SET status = 'new', resolved_at = NULL, resolved_by_user_id = NULL WHERE id = ${id}`);
  }
}
