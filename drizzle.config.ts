import { defineConfig } from 'drizzle-kit';

// Production config — Postgres (Supabase).
// Historic SQLite config removed; see git history for the libsql version.
export default defineConfig({
  schema: './src/db/schema-pg.ts',
  out: './drizzle-pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
