# Database backups

The production database is the **self-hosted Coolify Postgres** (NOT Neon/Vercel —
those references in older docs are stale). It holds legally-retained accounting
records (invoices, declarations, ledger), so it MUST be backed up off-site.

## Primary: Coolify native database backups (pg_dump → S3)

This is the correct, complete backup (a real `pg_dump`, run inside the Postgres
container where the tool exists — the app/node container has no `pg_dump`).

**Enable once in Coolify** (Dashboard → the Postgres resource → **Backups**):

1. **Schedule**: `0 2 * * *` (daily 02:00 UTC).
2. **Destination**: S3 → reuse the existing R2 bucket/creds (already configured for
   uploads: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`).
   Use a separate prefix/bucket, e.g. `facturamea-db-backups/`.
3. **Retention**: keep ≥ 30 daily + a few monthly (Coolify lets you set the count).
4. Toggle **Enabled** on.

> Action required from the operator: this is Coolify resource config (one-time, ~2
> min), not part of the repo build. Verify the first backup lands in R2.

## Restore

1. Download the dump from R2 (`facturamea-db-backups/<date>.sql.gz`).
2. `gunzip` it, then `psql "$DATABASE_URL" < dump.sql` against a fresh DB, or use
   Coolify's restore action on the Postgres resource.
3. Re-point the app's `DATABASE_URL` if restoring to a new instance.

## Verify backups regularly

A backup you never test is not a backup. Quarterly: restore the latest dump into a
scratch database and confirm row counts on `transport_invoices` + `journal_entries`.
