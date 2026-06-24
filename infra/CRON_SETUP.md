# Cron jobs (Coolify Scheduled Tasks)

facturamea runs on Coolify (self-hosted, `DEPLOY_TARGET=node`), so cron jobs are
**Coolify Scheduled Tasks**, not Vercel crons (the `vercel.json` `crons` block does
NOT run here and was removed). Each task calls an internal `/api/cron/*` endpoint
with the `CRON_SECRET` bearer token (the endpoints fail-closed without it).

## The 4 jobs (all enabled)

| Name | Schedule (UTC) | Endpoint | Purpose |
|------|----------------|----------|---------|
| `daily-maintenance`   | `0 6 * * *` | `/api/cron/daily`              | mark overdue invoices, refresh ANAF tokens, sync e-Factura status, GDPR purge |
| `recurring-invoices`  | `0 7 * * *` | `/api/cron/recurring-invoices` | emit due recurring invoices |
| `payment-reminders`   | `0 8 * * *` | `/api/cron/reminders`          | dunning / payment reminders |
| `blog-daily-article`  | `0 9 * * *` | `/api/cron/generate-article`   | auto-publish one SEO article |

## Task command (per job)

```sh
node -e 'fetch("https://facturamea.com/api/cron/<ENDPOINT>",{headers:{Authorization:"Bearer "+process.env.CRON_SECRET}}).then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.error(e);process.exit(1)})'
```

`CRON_SECRET` is read from the app's environment (already set in Coolify).

## Recreating them (e.g. after recreating the app)

Via the Coolify API (`POST /api/v1/applications/{uuid}/scheduled-tasks`):

```sh
# body: { "name": "...", "command": "<the node -e command above>", "frequency": "0 6 * * *" }
curl -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json" \
  "$COOLIFY_API/applications/$APP_UUID/scheduled-tasks" -d '{"name":"daily-maintenance","command":"...","frequency":"0 6 * * *"}'
```

> If the app/container is ever recreated, these tasks must be re-created — they
> are Coolify state, not part of the repo build. This doc is the source of truth.
