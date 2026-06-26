import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Dummy connection string so modules that import the db layer load without
    // a live DB (postgres-js connects lazily — no socket is opened until a query).
    env: { DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test' },
  },
});
