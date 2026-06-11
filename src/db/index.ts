import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema-pg';

// Production DB: Neon Postgres via Vercel Marketplace integration (DATABASE_URL auto-injected).

// Astro injects env via import.meta.env at build time, but plain Node (tsx for seed
// scripts, drizzle-kit, etc.) only has process.env. Guard the import.meta access so
// non-Astro contexts don't crash on `undefined.DATABASE_URL`.
const importMetaEnv = (import.meta as any).env as Record<string, string | undefined> | undefined;
const connectionString = importMetaEnv?.DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Expected a Postgres connection string.');
}

// Neon requires SSL on every connection. Skip SSL only when explicitly connecting to localhost.
const isLocal = /^(postgres(ql)?:\/\/)[^@]*@(localhost|127\.0\.0\.1)/.test(connectionString);

const pool = new pg.Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

// Re-export the schema module so callers that currently do `import { users } from '../db'`
// (via index → schema) keep working.
export * from './schema-pg';
