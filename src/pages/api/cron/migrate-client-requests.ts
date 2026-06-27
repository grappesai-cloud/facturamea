// One-shot migration: creates the client_requests table. Idempotent. Guarded by
// CRON_SECRET. Delete after running once on prod.
import type { APIRoute } from 'astro';
import { db } from '../../../db';
import { sql } from 'drizzle-orm';
import { isCronAuthorized } from '../../../lib/cron-auth';

export const GET: APIRoute = async ({ request }) => {
  if (!isCronAuthorized(request)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS "client_requests" (
      "id" text PRIMARY KEY,
      "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
      "created_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "title" varchar(200) NOT NULL,
      "note" text,
      "related_type" varchar(16),
      "related_id" text,
      "status" varchar(16) NOT NULL DEFAULT 'open',
      "response_note" text,
      "response_attachment_url" text,
      "response_attachment_name" varchar(200),
      "responded_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "responded_at" timestamp,
      "resolved_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
      "resolved_at" timestamp,
      "created_at" timestamp DEFAULT now(),
      "updated_at" timestamp DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_client_requests_company" ON "client_requests" ("company_id", "status")`);
    return new Response(JSON.stringify({ ok: true, applied: ['client_requests'] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'migrate failed' }), { status: 500 });
  }
};
