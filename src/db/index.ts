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
  // Sizing: the default (max 10, connectionTimeout 0 = wait forever) lets a dozen
  // concurrent report/dashboard users saturate the pool and hang every later
  // request indefinitely. Bound the wait + cap runaway queries.
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
});

export const db = drizzle(pool, { schema });

// True when a real Postgres connection is configured. In this build we always reach
// here with a live connection (we throw above otherwise), so it is always true.
// Consumed by the frontend (LandingLayout CTA, dashboard empty-state) to decide
// between the real-backend path and the no-DB display fallback.
export const dbAvailable = true;

// Re-export the schema module so callers that currently do `import { users } from '../db'`
// (via index → schema) keep working.
export * from './schema-pg';
