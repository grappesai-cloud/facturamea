# TransportHub — Infra Setup

This is the single source of truth for the production infrastructure of **transporthub.ro**.
No API keys, tokens, or passwords are stored here — only names of env variables and where they live.

Last updated: 2026-04-26

---

## Stack decisions (locked in)

| Concern | Choice | Rationale |
|---|---|---|
| Hosting | Vercel (Astro server adapter) | `@astrojs/vercel` already installed; Astro `output: 'server'`. |
| GitHub | `grappesai-cloud` | Org-level account for the project. |
| Database | Neon Postgres (via Vercel Marketplace) | Free tier, native Vercel integration (env vars auto-injected), Frankfurt region. Replaces Supabase (decision 2026-04-26). |
| Registrar (.ro) | RoTLD direct (rotld.ro) | Cheapest (~25 RON/year). Cloudflare does not support .ro. |
| DNS | Cloudflare | Nameservers pointed from RoTLD to Cloudflare. |
| Transactional email | Resend | Dedicated subdomain `send.transporthub.ro`. |
| Inbound email | Cloudflare Email Routing | Free, catch-all or explicit aliases → Gmail. No Google Workspace. |

**Aliases** that will forward to `alexandrucojanu.com@gmail.com`:
`contact@`, `support@`, `admin@`, `alexandru@`.

---

## 1. Accounts — owners & URLs

| Service | Account / Team | URL | Owner |
|---|---|---|---|
| GitHub | `grappesai-cloud` | https://github.com/grappesai-cloud | Alexandru Cojanu |
| Vercel | Team `grappesai-2100's projects` → project **transport-hub** (imported from `grappesai-cloud/transportHUB`, framework Astro) | https://vercel.com/grappesai-2100s-projects/transport-hub | Alexandru Cojanu (grappes.ai@gmail.com) |
| Neon | Provisioned via Vercel Marketplace → project **transport-hub** → Storage tab. Region: Frankfurt (`eu-central-1`). Free tier (0.5 GB storage, autosuspend on inactivity). | https://console.neon.tech | Alexandru Cojanu (grappes.ai@gmail.com) |
| RoTLD | *(account to be created at first checkout)* | https://rotld.ro | Alexandru Cojanu |
| Cloudflare | Account ID `b21ceaf662c7dab743bee9dce9580c79` — zone `transporthub.ro` (Free plan, pending activation until nameservers switch at RoTLD). | https://dash.cloudflare.com/b21ceaf662c7dab743bee9dce9580c79/transporthub.ro | Alexandru Cojanu (grappes.ai@gmail.com) |
| Resend | *(to be created)* | https://resend.com | Alexandru Cojanu |

---

## 2. Environment variables (in Vercel Project Settings → Environment Variables)

All variables are added with scope **Production + Preview** unless noted. Values are never committed to git.
Add them interactively via `vercel env add <NAME>` or through the Vercel dashboard.

| Name | Used by | Scope | Description |
|---|---|---|---|
| `DATABASE_URL` | `src/db/index.ts`, `src/db/seed.ts` | **Auto-injected** Prod + Preview by Vercel Neon integration | Pooled URL → `postgresql://[user]:[pw]@ep-xxx-pooler.eu-central-1.aws.neon.tech/[db]?sslmode=require`. Vercel injects this plus `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, etc. when the Neon integration is added to the project. |
| `DATABASE_URL_UNPOOLED` | migrations only (`drizzle-kit migrate`) | **Auto-injected** Prod + Preview | Direct (non-pooled) connection. Required for DDL. |
| `BETTER_AUTH_SECRET` | *(reserved — not yet used in code)* | **Set** Prod + Preview | 64-hex-char random string, auto-generated at deploy time. |
| `BETTER_AUTH_URL` | *(reserved)* | **Set** Prod + Preview | `https://transporthub.ro` (pre-set; will be valid once domain is linked). |
| `RESEND_API_KEY` | `src/lib/notifications.ts` (lazy — only thrown at runtime when an email notification fires) | *(not yet set)* | Build passes without it; runtime email notifications will throw until set. To be added after Resend domain `send.transporthub.ro` is verified. |
| `CRON_SECRET` | `src/pages/api/cron/daily.ts`, `src/pages/api/cron/hourly.ts` | *(not yet set)* | Bearer token auto-sent by Vercel Cron when configured in `vercel.json`. Generate with `openssl rand -hex 32`. |
| `BLOB_READ_WRITE_TOKEN` | (future: CMR upload, classified images, company docs) | *(not yet set)* | Auto-injected when Blob is enabled in Vercel project Storage. |

> **Removed:** `DATABASE_AUTH_TOKEN` (libsql/Turso, gone after Postgres migration). Supabase URL replaced by Neon-injected `DATABASE_URL` on 2026-04-26.

### How to add env vars

```sh
# Install Vercel CLI globally (one-time)
! npm install -g vercel

# Authenticate against Vercel
! vercel login

# From repo root, link to the project
! cd /Users/alexandrucojanu/transport-hub && vercel link

# DATABASE_URL is auto-injected when Neon is added via Marketplace (no manual add).
# Pull all env vars (incl. Neon ones) into a local .env.local for dev / migrations:
! cd /Users/alexandrucojanu/transport-hub && vercel env pull .env.local

# Manual env vars (not provided by an integration):
! cd /Users/alexandrucojanu/transport-hub && vercel env add BETTER_AUTH_SECRET production
! cd /Users/alexandrucojanu/transport-hub && vercel env add BETTER_AUTH_SECRET preview
! cd /Users/alexandrucojanu/transport-hub && vercel env add BETTER_AUTH_URL production
! cd /Users/alexandrucojanu/transport-hub && vercel env add RESEND_API_KEY production
! cd /Users/alexandrucojanu/transport-hub && vercel env add RESEND_API_KEY preview
```

---

## 2a. `vercel.json` (committed to repo root)

Fixes auto-detection failing on "Other" framework and pins functions to Frankfurt:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "astro",
  "buildCommand": "astro build",
  "installCommand": "npm install",
  "regions": ["fra1"]
}
```

Without this file, Vercel's first build failed with `Command "astro build" exited with 127` (astro CLI not in PATH because framework preset was "Other"). `regions: ["fra1"]` moves serverless functions to Frankfurt to co-locate with the Neon Postgres in `eu-central-1`.

## 3. GitHub → Vercel

1. Make sure the repo is pushed to `github.com/grappesai-cloud/transport-hub` (create private repo if missing).
2. On https://vercel.com, sign in with the GitHub account that has access to the `grappesai-cloud` org.
3. Click **Add New → Project**, select `grappesai-cloud/transport-hub`.
4. Framework preset: **Astro** (auto-detected). Root directory: `.`. Build command: `astro build`. Output: `.vercel/output` (auto).
5. **Do not deploy yet** — skip the build until env vars are set (next step).
6. Under Project → Settings → Environment Variables, add the four variables from §2.
7. Trigger a fresh deploy from the Vercel dashboard → Deployments → Redeploy.

Link the local repo to the Vercel project for CLI workflows:
```sh
! cd /Users/alexandrucojanu/transport-hub && vercel link
```

---

## 4. Database — Neon Postgres (via Vercel Marketplace)

### 4.1 Code (no changes needed)

Postgres migration was already done in the prior session (Apr 19). All schema, drivers, config, and migrations remain identical:
- `src/db/schema-pg.ts` — 19+ tables in Postgres types
- `src/db/index.ts` — `pg.Pool` + `drizzle-orm/node-postgres`, reads `DATABASE_URL`, SSL on for non-localhost (Neon requires SSL — works out of the box)
- `drizzle.config.ts` / `drizzle-pg.config.ts` — point at `schema-pg.ts`, dialect `postgresql`, output `drizzle-pg/`
- Existing migrations in `drizzle-pg/0000…0002.sql` are the source of truth; Neon will receive them as-is

> **Future optimization:** swap `pg.Pool` for `@neondatabase/serverless` + `drizzle-orm/neon-serverless`. Neon's HTTP/WebSocket driver eliminates TCP handshake on each cold start (10× faster first request). Not blocking for first deploy. Tracked as a follow-up.

### 4.2 Provision Neon — manual step (you do this in Vercel dashboard)

1. Open https://vercel.com/grappesai-2100s-projects/transport-hub
2. **Storage** tab → **Create Database** → **Neon (Serverless Postgres)** → **Continue**
3. Database name: `transport-hub-db` (or default). **Region: Frankfurt (`eu-central-1`)** to co-locate with `fra1` functions.
4. Plan: **Free**.
5. Connect to project: `transport-hub`, environments: **Production + Preview + Development** (all three).
6. Confirm. Vercel auto-injects `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_USER`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`.

After this is done, tell Claude — next steps run locally.

### 4.3 Pull env + apply migrations + seed

```sh
# Pull all Vercel env vars (incl. Neon's) into .env.local
! cd /Users/alexandrucojanu/transport-hub && vercel env pull .env.local

# Migrations need an unpooled connection (DDL). Use DATABASE_URL_UNPOOLED.
! cd /Users/alexandrucojanu/transport-hub && DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" npx drizzle-kit migrate

# Seed truck_types reference data (pooled is fine for DML)
! cd /Users/alexandrucojanu/transport-hub && DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx tsx src/db/seed.ts

# Seed cities (9,631 European cities from GeoNames)
! cd /Users/alexandrucojanu/transport-hub && DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx tsx scripts/seed-cities.ts

# Seed services catalog + sample info articles (CRB system, drivers, guarantees)
! cd /Users/alexandrucojanu/transport-hub && DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx tsx scripts/seed-services.ts

# Seed demo data (50 freight + 30 trucks + 10 auctions + demo users)
! cd /Users/alexandrucojanu/transport-hub && DATABASE_URL="$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')" npx tsx scripts/seed-demo.ts
```

Verify in Neon Console SQL Editor (https://console.neon.tech):
```sql
select count(*) from truck_types;        -- expect 14
select count(*) from cities;             -- expect 9,631
select table_name from information_schema.tables where table_schema='public';  -- expect 19+ app tables
```

---

## 5. Domain — transporthub.ro at RoTLD

Cloudflare Registrar does **not** support `.ro`. Purchase directly from RoTLD.

1. Create account at https://rotld.ro with `alexandrucojanu.com@gmail.com`.
2. Search `transporthub.ro`. Price: ~25 RON/year + VAT (annual).
3. Registrant data: use company or personal (RoTLD does not offer WHOIS privacy for .ro — data is public by default).
4. **Stop at checkout.** Confirm in writing with Alexandru before paying.
5. After purchase: RoTLD control panel → domain → **Change nameservers** → set to Cloudflare (values come from §6.1).
6. Note the registration expiration date here:

| Field | Value |
|---|---|
| Registrar | RoTLD |
| Registration date | *(fill after purchase)* |
| Expiration date | *(fill after purchase)* |
| Auto-renew | *(recommend: ON, 1 year)* |

---

## 6. DNS — Cloudflare

### 6.1 Zone setup

1. https://dash.cloudflare.com → **Add a site** → `transporthub.ro` → Free plan.
2. Cloudflare will scan existing records (none, since RoTLD has default). Skip.
3. Cloudflare will assign two nameservers. Example: `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`. Copy the exact values shown.
4. Go back to RoTLD control panel and set those as the domain's nameservers.
5. Propagation: 5 min–24h. Check with `dig NS transporthub.ro +short`.

| Field | Value |
|---|---|
| Zone ID | *(to capture after zone activates — visible in Cloudflare → `transporthub.ro` → Overview → right sidebar)* |
| NS #1 | `ariella.ns.cloudflare.com` |
| NS #2 | `howard.ns.cloudflare.com` |

> These are the two nameservers that must be set at the **RoTLD control panel** when `transporthub.ro` is purchased (step §5). The zone stays "Pending" at Cloudflare until the NS change propagates (5 min–24h).

### 6.2 DNS records

All records are added in Cloudflare → DNS → Records. "Proxy" = orange cloud ON (unless noted as DNS-only grey).

| Type | Name | Content | TTL | Proxy | Purpose |
|---|---|---|---|---|---|
| A | `@` | `76.76.21.21` | Auto | DNS-only (grey) | Vercel apex. Vercel provides the IP when you add the domain (§8). |
| CNAME | `www` | `cname.vercel-dns.com` | Auto | DNS-only (grey) | Vercel www alias. |
| CNAME | `send` | `feedback-smtp.eu-west-1.amazonses.com` (or similar — Resend shows it) | Auto | DNS-only | Resend return-path. |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | Auto | n/a | Resend SPF on subdomain. |
| TXT | `resend._domainkey.send` | *(from Resend)* | Auto | n/a | Resend DKIM. |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:alexandru@transporthub.ro` | Auto | n/a | DMARC. |
| MX | `@` | *(2 records from Cloudflare Email Routing — see §7)* | Auto | n/a | Inbound to Email Routing. |
| TXT | `@` | *(SPF line from Email Routing — see §7)* | Auto | n/a | Email Routing SPF. |

> Proxy (orange cloud) must be OFF for `@` and `www` when pointing to Vercel — otherwise Cloudflare's proxy breaks the Vercel cert flow. Use Cloudflare for DNS only for web traffic; proxy can be enabled later after cert is issued (optional, brings some perf benefits but also adds a cache layer to troubleshoot).

Records will be filled into this table as they are created, with exact values from the respective service dashboards.

---

## 7. Inbound email — Cloudflare Email Routing (free)

> **Status: Gated.** Email Routing cannot be enabled until the zone is **active** (status changes from Pending → Active once NS are switched at RoTLD and propagation completes). Run the steps below after §5 (domain purchase) and §6.1 (NS switch at RoTLD).

1. Cloudflare dashboard → `transporthub.ro` → **Email** → **Email Routing** → **Enable**.
2. Cloudflare auto-creates the MX records and the SPF TXT; accept.
3. **Destination addresses** → add `alexandrucojanu.com@gmail.com` → Cloudflare sends a verification email → click the link.
4. **Routing rules → Custom addresses**, add:
   - `contact@transporthub.ro` → `alexandrucojanu.com@gmail.com`
   - `support@transporthub.ro` → `alexandrucojanu.com@gmail.com`
   - `admin@transporthub.ro` → `alexandrucojanu.com@gmail.com`
   - `alexandru@transporthub.ro` → `alexandrucojanu.com@gmail.com`
5. **Catch-all** → set to "Drop" (reject spam to `*@`) or to forward (opens to spam). Recommend **Drop**.
6. Verify after a few minutes: send a test email to `contact@transporthub.ro` from any external address; it should arrive at Gmail.

SPF note: Cloudflare Email Routing sets `v=spf1 include:_spf.mx.cloudflare.net ~all` on the root TXT. Resend outbound is on subdomain `send.`, so the SPF records do not conflict.

---

## 8. Link domain to Vercel

Only after §6 propagation (`dig A transporthub.ro +short` returns something):

1. Vercel project → **Settings → Domains** → Add `transporthub.ro`. Vercel will show required A/CNAME; copy into Cloudflare (§6.2).
2. Add `www.transporthub.ro`. Set redirect behavior: `www` → `apex` (or reverse — user preference).
3. Wait for Vercel to issue the SSL cert (Let's Encrypt, automatic).
4. `curl -I https://transporthub.ro` should return `200` or `301` from Vercel, with a valid cert.

---

## 9. Transactional email — Resend

1. https://resend.com → sign up with `alexandrucojanu.com@gmail.com`.
2. **Domains → Add domain** → `send.transporthub.ro` (subdomain is intentional to keep root SPF clean for Email Routing).
3. Resend shows 3 records to add on Cloudflare (CNAME + TXT SPF + TXT DKIM). Add them to the `transporthub.ro` zone (see §6.2 table).
4. Wait for Resend to show "Verified" on all three.
5. **API Keys → Create API Key** → name `vercel-prod` → permission "Sending access" → scope to `send.transporthub.ro`. Copy the key.
6. Add to Vercel: `vercel env add RESEND_API_KEY production`, paste the key.
7. **Test send** from Resend Dashboard → Emails → Send → from `no-reply@send.transporthub.ro` to `alexandrucojanu.com@gmail.com`. Verify delivery + landing in inbox (not spam) and that SPF+DKIM pass (check Gmail "Show original").

> Code integration (calling Resend from the app) is **not yet wired**. This is intentional — only the env var is prepped so future code just reads `import.meta.env.RESEND_API_KEY`.

---

## 10. End-to-end verification checklist

Run through after all §1–9 are green:

- [ ] `dig NS transporthub.ro +short` returns Cloudflare NS values
- [ ] `dig A transporthub.ro +short` returns a Vercel IP
- [ ] `dig MX transporthub.ro +short` returns Cloudflare Email Routing MX values
- [ ] `dig TXT transporthub.ro +short` includes Email Routing SPF
- [ ] `dig TXT send.transporthub.ro +short` includes Resend SPF
- [ ] `dig TXT resend._domainkey.send.transporthub.ro +short` returns DKIM public key
- [ ] `https://transporthub.ro` loads (200 / valid cert)
- [ ] `https://www.transporthub.ro` redirects to apex (or vice versa per preference)
- [ ] Registration flow: create a new user on prod site → lands in Neon `users` table
- [ ] Login flow: session cookie issued, `users.lastLogin` updated (if applicable)
- [ ] Send test email to `contact@transporthub.ro` → received at Gmail within 1 min
- [ ] Resend test send lands in inbox; Gmail "Show original" shows SPF=PASS, DKIM=PASS, DMARC=PASS
- [ ] Vercel deployment: latest main build is green, no runtime errors in Functions logs

---

## 10a. Vercel Blob (file uploads)

Required for: CMR photo upload on orders, classified images, company documents.

1. Vercel project → **Storage** tab → **Create Database** → **Blob** → **Continue**.
2. Name: `transport-hub-blob`. Create.
3. Connect to project → **Production + Preview + Development**.
4. Vercel auto-injects `BLOB_READ_WRITE_TOKEN`.
5. Code that needs it (future CMR/upload endpoints) reads via `import.meta.env.BLOB_READ_WRITE_TOKEN`.
6. Currently the schema has `cmrPhotoUrl`, `coverImageUrl`, `documentUrl` columns ready — backend integration deferred until Blob is enabled.

## 10b. Cron jobs (Vercel Cron)

`vercel.json` is wired for two cron schedules:

```json
{
  "crons": [
    { "path": "/api/cron/daily", "schedule": "0 6 * * *" },
    { "path": "/api/cron/hourly", "schedule": "0 * * * *" }
  ]
}
```

- `/api/cron/daily` (06:00 UTC): expires freight/trucks/auctions past their date, expires licenses, sends document expiry notifications (30/14/3 days before).
- `/api/cron/hourly`: auto-expires auctions whose `endsAt` has passed.

Both endpoints check `Authorization: Bearer ${CRON_SECRET}`. Steps:

1. Generate a token: `openssl rand -hex 32`.
2. `! cd /Users/alexandrucojanu/transport-hub && vercel env add CRON_SECRET production` → paste.
3. Repeat for `preview`.
4. Vercel Cron sends the bearer automatically when scheduled in `vercel.json`. No further wiring.

---

## 11. Blocked / awaiting user

| Item | Blocked on | Since |
|---|---|---|
| Neon provisioning | User to add Neon database via Vercel dashboard → Storage tab (region Frankfurt, Free plan). See §4.2. | 2026-04-26 |
| Run migrations + seed on Neon | After Neon provisioned: `vercel env pull .env.local`, then `drizzle-kit migrate` + seed. See §4.3. | 2026-04-26 |
| Vercel first green build | User to push an empty commit to `grappesai-cloud/transport-hub` main, or `git commit --allow-empty -m "Trigger" && git push`. Webhook is wired since reconnect; next push auto-deploys from `vercel.json` (framework=astro, fra1). | 2026-04-19 |
| RoTLD domain purchase | User to complete checkout for `transporthub.ro` at rotld.ro, set NS to `ariella.ns.cloudflare.com` + `howard.ns.cloudflare.com`. | 2026-04-19 |
| Cloudflare Email Routing | Gated until zone activates (after NS switch at RoTLD). | 2026-04-19 |
| RoTLD purchase | User OK at checkout | 2026-04-19 |
| Vercel login | User to run `! vercel login` in chat | 2026-04-19 |
| Cloudflare account | User to create account (or share if existing) | 2026-04-19 |
| Resend account | Paused — second account on grappes.ai@gmail.com requires a paid plan. Revisit when a workaround is picked (use different email, pay, or scope differently). | 2026-04-19 |

---

## 11a. Local development with Neon

The old `file:local.db` (SQLite) no longer works — `src/db/index.ts` requires a Postgres URL. Two options:

1. **Use the Vercel-injected dev branch (recommended).** The Vercel Neon integration includes a "Development" scope. After `vercel env pull .env.local`, `.env.local` will contain `DATABASE_URL` pointing to the dev branch. Either rename `.env.local` → `.env` or update your local startup to load `.env.local`.
2. **Local Postgres via Docker** (fully offline):
   ```sh
   docker run -d --name th-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
   ```
   Then `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres` in `.env`. Run migrations + seed.

Legacy `drizzle/` folder (SQLite migrations) can be deleted; `drizzle-pg/` is the source of truth.

---

## 12. Out of scope (explicitly not done in this session)

- Google Workspace — skipped per user decision (Resend outbound + Cloudflare Email Routing inbound covers needs).
- `better-auth` library wiring — currently unused; app uses custom bcrypt+sessions in `src/lib/auth.ts`. Env vars `BETTER_AUTH_*` kept as placeholders for future migration.
- Resend code integration (e.g. order confirmation emails) — not wired. Only the API key env var is prepared.
- Cron jobs for expiring freight/orders (exists in schema with `expires_at` fields) — no scheduler yet.
- Backups — Neon Free has 1-day history (point-in-time restore window) and branching for snapshots. Revisit if paid plan chosen.
- Observability — no Sentry/Axiom/Datadog wired yet.

---

## 13. Change log

| Date | Change | By |
|---|---|---|
| 2026-04-19 | Initial scaffold. Schema migrated from SQLite to Postgres. Decisions recorded. | Cowork session |
| 2026-04-26 | Switched DB from Supabase → Neon (via Vercel Marketplace). No code changes; only infra + env vars (auto-injected). Migrations remain in `drizzle-pg/`. | Cowork session |
| 2026-04-27 | Schema additions: 8 new tables (credit_balances, services_catalog, credit_transactions, invoice_guarantees, drivers, driver_certificates, info_articles, flagged_contacts, audit_log). New migration `drizzle-pg/0003_phase3_credits_drivers_guarantees.sql`. New seed `scripts/seed-services.ts`. New env vars: `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`. | Cowork session |
