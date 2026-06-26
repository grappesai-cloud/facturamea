// POST /api/admin/migrate-device-tokens — one-shot, admin-only, idempotent.
// Creates the device_tokens table for native push. Additive DDL only
// (CREATE ... IF NOT EXISTS). Safe to call repeatedly; remove after running.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';

export const POST: APIRoute = async ({ locals }) => {
  const user = locals.user as any;
  if (!user?.isAdmin && user?.userType !== 'admin') {
    return new Response(JSON.stringify({ error: 'Acces interzis' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS device_tokens (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_id text,
      platform varchar(12) NOT NULL,
      token text NOT NULL,
      created_at timestamp DEFAULT now(),
      last_seen_at timestamp DEFAULT now()
    )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_device_token ON device_tokens (token)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id)`);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
