# facturamea

Facturare completă pentru firme din România, la nivelul planurilor maxime Oblio/Smartbill, cu o singură plată (licență pe viață, 700 RON). Web + iOS + Android.

## Stack

- **Astro 6** SSR + **React 19** islands
- **Tailwind CSS v4**
- **Drizzle ORM** + **Neon Postgres**
- **Vercel** (adapter) + Cron
- Sesiuni custom + OAuth (Google, Apple) + email/parolă
- **Stripe** (plată one-time pentru licența pe viață)
- **Capacitor** (iOS + Android, hosted model)

## Module

| Modul | Rute |
|------|------|
| Tablou de bord | `/app` |
| Facturare (facturi, proforme, avize, chitanțe, recurente) | `/app/facturare/*` |
| e-Factura (ANAF SPV) + e-Transport | `/app/facturare/efactura`, `src/lib/anaf/*`, `src/lib/efactura.ts` |
| SAF-T D406 | `/app/rapoarte/saft`, `src/lib/d406-saft.ts` |
| Gestiune stocuri (depozite, NIR, mișcări) | `/app/gestiune/*` |
| Cheltuieli & furnizori | `/app/cheltuieli/*` |
| POS / casă de marcat | `/app/pos/*` |
| Rapoarte | `/app/facturare/rapoarte` |
| Admin | `/admin/*` |
| Licență & plată | `/app/setari/abonament` |

## Setup local

1. **Provisionează un proiect Neon nou** (NU refolosi credențialele moștenite, vezi `*.inherited.bak`).
2. Copiază valorile în `.env.local` (cheile sunt deja listate acolo).
3. Instalează + împinge schema:
   ```bash
   npm install
   DATABASE_URL="postgres://..." npx drizzle-kit push   # creează toate tabelele din src/db/schema-pg.ts
   npm run dev                                            # http://localhost:4321
   ```
4. Creează un cont, apoi marchează-l admin în DB: `UPDATE users SET is_admin = true WHERE email = '...';`

## Variabile de mediu

Vezi `.env.local`. Cheile principale:

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (Neon)
- `BETTER_AUTH_SECRET`, `PUBLIC_APP_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (redirect `<APP>/api/auth/google/callback`)
- `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (cheia .p8); redirect `<APP>/api/auth/apple/callback`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, opțional `STRIPE_LIFETIME_PRICE_ID` (altfel price_data inline 700 RON)
- `RESEND_API_KEY`, `RESEND_FROM`
- `ANAF_CLIENT_ID`, `ANAF_CLIENT_SECRET`, `ANAF_REDIRECT_URI`, `ANAF_API_MODE` (test|prod), `ANAF_ENCRYPTION_KEY` (hex 64)
- `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`

## Plata licenței pe viață (Stripe)

- `POST /api/checkout/lifetime` creează o sesiune Checkout (700 RON, one-time).
- Webhook `POST /api/webhooks/stripe` (`checkout.session.completed`) -> `grantLifetime(companyId)`.
- Trial implicit: 14 zile (`src/lib/license.ts`). După expirare, middleware redirecționează `/app/*` către `/app/setari/abonament`.
- Grant manual (white-label) din `/admin/licente`.

## Capacitor (iOS + Android)

Model hosted: shell-ul nativ încarcă aplicația web live (`server.url` în `capacitor.config.ts`).

```bash
npm install
npx cap add ios
npx cap add android
npm run cap:sync
npm run cap:ios       # deschide Xcode
npm run cap:android   # deschide Android Studio
```

App ID: `com.facturamea.app`. Dev pe device local: `CAP_SERVER_URL=http://192.168.x.x:4321 npm run cap:sync`.

## Cron (vercel.json)

- `/api/cron/daily` (06:00 UTC) marchează facturile cu termen depășit.
- `/api/cron/recurring-invoices` (07:00 UTC) emite facturile recurente.

## Verificare

```bash
npm run typecheck   # astro check (0 erori)
npm run test        # vitest
```

## Note

- Proiectul a pornit din motorul de facturare validat din TransportHub (ANAF, e-Factura, SAF-T, serii, TVA, recurente) și a fost decuplat complet într-o platformă separată.
- Tabela de facturi se numește încă `transport_invoices` (moștenire), dar e generică (`kind` = factura/proforma/aviz/chitanta/storno).
- TVA implicit: 21% (cota RO 2026).
