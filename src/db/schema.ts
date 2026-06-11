// Compat shim: this module is now a re-export of the Postgres schema.
// Historically the app used SQLite via libsql (see schema-pg.ts comments).
// All existing `import { ... } from '.../db/schema'` continue to work.
// For new code, prefer importing from './schema-pg' directly.
export * from './schema-pg';
