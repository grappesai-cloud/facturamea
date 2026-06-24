# facturamea — Audit pre-lansare (2026-06-24)

**Verdict: NO_GO** · 111 findings confirmate (din 132 verificate) · 5 blocante · 26 high

> facturamea has 5 launch blockers (API-layer paywall bypass, token-login bypassing email-verify + lockout, foreign-currency fiscal misstatement across all declarations, sales invoices never decrementing stock, prod logging fully stripped with zero error capture) plus ~30 high-severity fiscal-correctness, money-corruption, and concurrency issues. Do not launch as-is.

---

## 🔴 BLOCANTE (must-fix înainte de lansare)

### B1. Paywall not enforced at the API layer — any free/unpaid user can use every paid feature and file real fiscal documents
- **Fișier:** `src/middleware.ts:318-335`
- **De ce:** The license/activation gate (licenseState + redirect to /app/onboarding when !active) runs ONLY inside `if (pathname.startsWith('/app'))`. None of the 170 /api/* endpoints check locals.license.active, and the v1 public API + Capacitor Bearer token skip the /app branch entirely. A free user (or anyone with a key) can POST /api/invoicing/invoices, submit real ANAF e-Factura, run reports, etc. The 700 RON lifetime paywall is purely cosmetic. Direct, total revenue bypass.
- **Fix:** Add a shared requirePaidLicense(locals) guard (like require-role) and call it at the top of every mutating paid endpoint, OR enforce in middleware for `pathname.startsWith('/api/')` + MUTATING_METHOD (excluding auth/checkout/webhook/onboarding/license-status): call licenseState(companyId) and return 402/403 JSON when !st.active. Also gate the v1 API inside requireApiKey/lib/api-v1.ts.

### B2. Token-login /api/auth/token bypasses mandatory email verification AND account lockout AND Turnstile
- **Fișier:** `src/pages/api/auth/token.ts:21 (calls bare loginUser, src/lib/auth.ts:301-319)`
- **De ce:** token.ts calls bare loginUser() then mints a Bearer session. loginUser never checks user.emailVerified and never records a failed attempt, so: (1) an unverified-email account gets a full session, defeating the 'mandatory email verification' gate; (2) there is no per-account 5-fail/15-min lockout here, only the per-IP middleware throttle — and getClientIp is spoofable on Coolify (x-forwarded-for trusted), so a rotating-IP credential-stuffing attack is unthrottled. The endpoint is also CSRF-exempt and has no Turnstile. It is the weakest door into every account, including admin.
- **Fix:** Make token.ts reuse the cookie-login branch logic from [...all].ts: before createSession, `if (!user.emailVerified) return 403`; wrap in checkLoginLockoutAsync/recordFailedLoginAsync/clearLoginAttemptsAsync(email); apply verifyTurnstile. Independently fix getClientIp to read only the trusted-proxy header on the Coolify/Node target (do not trust raw x-forwarded-for).

### B3. Foreign-currency invoices feed currency cents into D300/D390/D394/SAF-T and the ledger as if they were RON — fiscal misstatement
- **Fișier:** `src/lib/declaratii.ts:136-141,179-184; reports/d390.ts:129; src/lib/accounting.ts:355-357; src/lib/d406-saft.ts (totals)`
- **De ce:** All money is stored only in the invoice currency; the captured bnrRate is never applied. declaratii.ts sums raw inv.subtotalCents/inv.vatCents and emits them as RON; D390 (VIES — intra-EU is almost always EUR, highest exposure) and SAF-T grand totals do the same; postInvoice debits/credits in currency cents. A 1.000 EUR base is declared as 1.000 RON instead of ~4.970 RON. This understates VAT base and collected/deductible VAT to ANAF and corrupts the trial balance for any non-RON invoice. Verified: declaratii.ts:136-141 adds subtotalCents/vatCents with no FX conversion.
- **Fix:** Snapshot RON values at issue on transport_invoices (subtotalRonCents/vatRonCents/totalRonCents = currency==='RON' ? cents : Math.round(cents*bnrRate)); hard-fail issuing a non-RON invoice with no bnrRate. Aggregate the RON snapshots in declaratii.ts, d390.ts, postInvoice and SAF-T. Until shipped, gate foreign-currency invoicing OFF (RON-only is fiscally sound modulo the cash-VAT timing fix).

### B4. Sales invoices never decrement stock — gestiune is structurally broken as an inventory system
- **Fișier:** `src/lib/stock.ts callers (verified: zero invoicing/* callers of applyStockOut)`
- **De ce:** grep confirms applyStockOut/applyStockIn are called ONLY from pos/sales, gestiune/{transfer,receptions,counts}, comenzi/purchase — never from any invoicing/* path. Stock is received via NIR/purchase but never drawn down when goods are sold on a factură (the primary document of an invoicing SaaS). On-hand quantities and the movement ledger only ever go up; gestiune reports permanently overstate inventory and SAF-T/stock-derived figures are inconsistent. The schema even lists stockMovements.refType 'invoice' but nothing writes it.
- **Fix:** In the invoice issue/post path, for a 'factura'/'aviz' shipping goods, iterate lines with a productId and call applyStockOut(cid, warehouseId, productId, qty, level.avgCostCents, {refType:'invoice', refId}, tx) inside the issuing transaction. Add a warehouse selector / default warehouse. Guard with the issued-idempotency flag so storno reverses via applyStockIn. (Also fix the stock.ts lock-free read-modify-write concurrency issue below before this goes live.)

### B5. Production logging fully stripped (esbuild drop:['console']) — zero error capture in prod
- **Fișier:** `astro.config.mjs:45-48 (shared vite.esbuild drop) vs src/lib/logger.ts, src/lib/observability.ts`
- **De ce:** `esbuild: { drop: ['console','debugger'] }` is in the SHARED vite config and Astro applies it to the SSR server build (verified in committed dist/server chunks: logger emit() computes the line then discards it; cron catch-blocks compile to empty `catch {}`). logger.info/warn/error emit nothing; captureError() logs via log.error → also silent. With SENTRY_DSN unset by default, there is ZERO error capture: every 500, failed ANAF/Stripe/email call, and cron exception vanishes silently, while middleware tells users 'the team has been notified.' You launch blind.
- **Fix:** Scope the drop to client bundles only, or remove `drop:['console']` and rely on logger.ts's own isProd gate, or change logger internals to process.stdout.write (esbuild does not strip that) so Coolify captures container logs. Configure SENTRY_DSN and switch env detection off Vercel-only vars.

## 🟠 HIGH PRIORITY

**H1. TOTP secret + password-reset/team-join tokens stored in plaintext at rest (DB leak = full 2FA bypass + account takeover)**
- `src/db/schema-pg.ts:23,77; enroll.ts:32; [...all].ts:369,395`
- Fix: Encrypt totpSecret via lib/crypto.encryptSecret/decryptSecret (same as ANAF tokens). Store only sha256/hmac of reset+join tokens (hash on issue, hash-then-lookup on redeem). Shorten join TTL from 30d.

**H2. Spoofable client IP on Coolify/Node defeats all IP-keyed rate-limits and the lockout throttle**
- `src/lib/security.ts:154-165`
- Fix: On DEPLOY_TARGET=node, read only a trusted header set by Traefik (x-real-ip), ignore client x-forwarded-for; drop the x-vercel-forwarded-for branch. Update the stale 'we deploy behind Vercel' comment.

**H3. viewer/operator role can disconnect ANAF and mutate banking/e-Transport/fixed-assets/reconcile/depreciation/connectors (missing requireRole)**
- `src/pages/api/anaf/disconnect.ts:6-16; banca/transactions/[id].ts; anaf/etransport/declare.ts; mijloace-fixe/[id].ts + run-depreciation.ts; connectors/*; onboarding/company.ts:23-61`
- Fix: Add requireRole('settings.manage'/'stock.manage'/'expense.manage'/'invoice.create') to each mutating handler. Establish a checklist: every POST/PATCH/PUT/DELETE calls requireRole before mutating.

**H4. Invoice email send unconditionally overwrites status to 'sent', destroying paid/reversed/overdue state (fiscal-period reporting impact)**
- `src/pages/api/invoicing/invoices/[id]/send.ts:47`
- Fix: Conditional update: .where(and(eq(id), inArray(status,['draft','issued']))). For other statuses bump sentAt only, never SET status.

**H5. Bank reconcile mutates paidCents directly without a payments ledger row — next manual payment recomputes from SUM and erases the reconciled money**
- `src/pages/api/banca/transactions/[id].ts:132-137`
- Fix: Insert a transportInvoicePayments row (reference=bank tx id) in the same tx, then recompute paidCents from SUM like payments.ts/chitanta.ts. PATCH undo deletes that row and recomputes. Wrap PATCH in db.transaction.

**H6. Auto-post / webhook / POS / NIR idempotency is non-atomic SELECT-then-INSERT with no backing unique constraint — duplicate journal entries (double revenue/VAT), duplicate card payments, duplicate BON numbers**
- `src/lib/accounting.ts:266-279; webhooks/stripe.ts:71-101; netopia/[invoiceId].ts:97-131; pos/sales/index.ts:91-96; receptions/index.ts`
- Fix: Add partial unique indexes: journal_entries(company_id,ref_type,ref_id) WHERE ref_type IS NOT NULL; transportInvoicePayments(invoiceId,reference) WHERE reference NOT NULL; posSales(companyId,receiptNumber); receptions(companyId,nirNumber). Insert inside tx, treat 23505 as benign duplicate.

**H7. Recurring-invoice cron can double-bill — due rows selected and nextRunAt advanced (by id only) with no run-lock against overlapping invocations**
- `src/lib/recurring-invoices.ts:40-41,150-155; cron/recurring-invoices.ts`
- Fix: Conditional claim FIRST in tx: UPDATE ... SET nextRunAt=new WHERE id=$1 AND nextRunAt=$old; abort emission if rowCount===0. Or wrap the runner in pg_try_advisory_lock.

**H8. Recurring advanceDate() overflows on month-end run dates — monthly/quarterly/yearly schedules skip a month and drift permanently**
- `src/lib/recurring-invoices.ts:19-29`
- Fix: Clamp to last valid day of target month and persist the anchor day-of-month so drift never accumulates. Verified at runtime: Jan 31 +1mo -> Mar 3 (February never billed).

**H9. Refund deactivates license but never reverses the revenue-share Stripe Connect transfer to the associate — money leak on every refund**
- `src/pages/api/admin/refund.ts:31-43`
- Fix: Look up revenueSharePayouts rows (status='paid') for the session/companyId and stripe.transfers.createReversal(transferId, {amount}); mark payout 'reversed'. Make idempotent.

**H10. Lock-free read-modify-write on stockLevels (no FOR UPDATE, no ON CONFLICT, READ COMMITTED) — concurrent ops lose quantity and corrupt weighted-average cost; first-write race aborts the whole NIR/POS/transfer**
- `src/lib/stock.ts:26-37,56-79,113-135`
- Fix: Replace SELECT/INSERT/UPDATE with a single INSERT ... ON CONFLICT (warehouse_id,product_id) DO UPDATE SET quantity=stock_levels.quantity+EXCLUDED.quantity, avg_cost_cents=<weighted blend>, or SELECT ... FOR UPDATE before the math.

**H11. e-Transport XML does not match ANAF v2 XSD — every UIT declaration rejected (hard compliance failure)**
- `src/lib/anaf/etransport.ts:186,195-209`
- Fix: Rebuild buildEtransportXml() against the official eTransport v2 XSD (correct element/attribute names + real codScopOperatiune nomenclature); validate against XSD in CI. Gate the feature OFF until validated.

**H12. No duplicate-submission guard — an invoice can be uploaded to ANAF SPV multiple times (double-registered e-invoice)**
- `src/lib/efactura-submit.ts:17-112; anaf/efactura/submit.ts; invoices/index.ts:221-228 (the claimed efacturaStatus re-send guard is absent)`
- Fix: Before upload, refuse when inv.efacturaStatus is 'submitted'/'validated' unless an explicit force flag; allow resend only from 'rejected'/null. Apply to all three submit paths.

**H13. Foreign-currency e-Factura parser double-counts VAT (sums two TaxTotal blocks) — over-claimed deductible VAT on inbox import into D300/D394**
- `src/lib/efactura-parse.ts:95-97 (gen src/lib/efactura.ts:245-275)`
- Fix: Sum only the TaxTotal whose currencyID matches DocumentCurrencyCode (prefer document-currency total, ignore the RON-only TaxCurrencyCode total).

**H14. Line net uses full-precision quantity while InvoicedQuantity prints 2 decimals — BR-CO-10 rejection on fractional quantities**
- `src/lib/efactura.ts:188,208-209`
- Fix: Print InvoicedQuantity at the precision used to compute lineNetCents (up to 4 dp) so round(printedQty*printedPrice)==LineExtensionAmount.

**H15. D390 codes all intra-EU sales as goods 'L' (services must be 'P') — VIES mismatches / ANAF discrepancy notices for a services business**
- `src/pages/api/invoicing/reports/d390.ts:129,156`
- Fix: Add a goods/services flag per line or partner; map intra-EU services to P (sales) / T (acquisitions) instead of L/A.

**H16. D406 SAF-T uses invented TaxCode strings, wrong AuditFileVersion (2.4.6), missing MasterFiles, AND emits foreign-currency amounts under a RON DefaultCurrencyCode — not submittable / won't reconcile**
- `src/lib/d406-saft.ts:86-130,99,155,176,190-193`
- Fix: Map vatRate to official numeric SAF-T TaxCode; set AuditFileVersion to current RO value; add GeneralLedgerAccounts/TaxTable/UOMTable/Products; emit RON-converted amounts with original currency+ExchangeRate in the Currency block. Keep labelled 'draft/orientativ' until DUKIntegrator-validated.

**H17. D300 ignores TVA-la-încasare (cash VAT) timing — VAT reported at issue instead of collection date (legally wrong figure for cash-VAT taxpayers)**
- `src/lib/declaratii.ts:119-143,271-274`
- Fix: When inv.vatAtCollection / vatRegime==='tva_la_incasare', report only VAT proportional to amounts collected within the period (join payments by receivedAt). Apply symmetric rule to deductible VAT on cash-accounting purchases.

**H18. v1 invoice creation reserves a fiscal sequence number then inserts header+lines with NO transaction — number gaps and lineless invoices on failure**
- `src/pages/api/v1/invoices/index.ts:146-178`
- Fix: Wrap nextSeriesNumber + header insert + lines insert in a single db.transaction so a failure rolls back the consumed number and partial rows.

**H19. v1 API: scopes never enforced (no read-only key) AND test-mode keys do real fiscal writes (burn live series numbers) AND no license gate AND GET unthrottled**
- `src/lib/api-keys.ts:22-39; v1 handlers; src/middleware.ts:171,216`
- Fix: Enforce requireScope on every v1 handler; sandbox or remove test mode; call licenseState in requireApiKey and reject writes when !active; rate-limit ALL v1 methods keyed by keyId/companyId with a per-key quota.

**H20. GDPR right-to-erasure never executes — soft-delete sets deletedAt but no cron ever purges; PII retained indefinitely**
- `src/pages/api/me/delete.ts:8-12,43-57; cron/daily.ts (no purge logic)`
- Fix: Add a daily.ts step that hard-deletes/anonymises users where deletedAt<now-30d (cascade company PII, clear credentials/totpSecret, null audit IPs), keeping only fiscally-mandated data; OR change the user-facing message + privacy policy to state the real retention.

**H21. Analytics endpoint runs unscoped SELECT * FROM transport_invoice_lines (ALL tenants) on routine dashboard loads — multi-second latency / OOM / cross-tenant memory load**
- `src/pages/api/invoicing/reports/analytics.ts:86-99`
- Fix: Scope to the period's invoiceIds via inArray (chunked) or aggregate in SQL with JOIN + GROUP BY description LIMIT 8.

**H22. pg.Pool default max=10 + connectionTimeoutMillis=0 — a dozen concurrent report/dashboard users saturate the pool and further requests hang forever**
- `src/db/index.ts:20-25`
- Fix: new pg.Pool({...,max:20,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,statement_timeout:30000}); parallelize independent dashboard queries with Promise.all.

**H23. PDF endpoint cold-launches Chromium per request + self-HTTP round-trip, no concurrency guard — a few concurrent downloads OOM-kill the single Coolify container**
- `src/pages/api/invoicing/invoices/[id]/pdf.ts:35-65`
- Fix: Reuse a single long-lived browser (page per request) or a 1-2 concurrency limiter with 429 fallback; render via page.setContent() instead of goto() to a re-authenticated /print route.

**H24. Crons scheduled only via vercel.json (ignored on Coolify) + generate-article unscheduled — overdue marking, recurring invoicing, dunning, ANAF token/e-Factura sync likely never run in prod**
- `vercel.json:7-11 vs src/pages/api/cron/*`
- Fix: Create all 4 jobs as Coolify Scheduled Tasks (curl with Authorization: Bearer $CRON_SECRET), commit the schedule definitions, delete the dead vercel.json crons and fix infra/SETUP.md.

**H25. No DB backup strategy for the actual prod (self-hosted Coolify Postgres) — total irrecoverable loss of legally-retained accounting records**
- `infra/SETUP.md:366 (only note assumes Neon, not prod)`
- Fix: Automate nightly pg_dump to S3/R2 (already configured) as a Coolify Scheduled Task with off-site retention; document restore; stop describing the DB as Neon/Vercel.

**H26. Recurring-invoice line editor offers stale 0/5/9/19% VAT (no current 21% standard / 11% reduced) — auto-generated invoices carry the wrong VAT rate indefinitely**
- `src/components/invoicing/RecurringManager.tsx:236 (default vatRate:19 line 37)`
- Fix: Replace hardcoded options with the canonical set 21/11/9/5/0 (ideally load from /api/invoicing/tva like InvoiceEmitForm); default to 21.

---

## Raport narativ

# facturamea — Pre-Launch Readiness Report

**Verdict: NO_GO.** Five launch-blocking issues exist (one of them defeats the entire 700 RON paywall, another silently misstates VAT on every foreign-currency invoice, a third leaves the app with no error visibility in production). On top of the blockers there are ~30 high-severity fiscal-correctness, money-corruption, concurrency, and ops issues. The codebase has a strong skeleton — solid tenant isolation, hashed sessions, atomic invoice numbering, correct cents arithmetic, verified webhooks — but the fiscal/compliance surface and the money/concurrency paths are not safe to put in front of real Romanian taxpayers yet.

Fix all 5 blockers and the HIGH cluster (especially the money-corruption and ANAF-rejection items) before launch. RON-only, single-user usage is largely sound today; the danger lives in multi-currency, multi-user concurrency, the public/mobile API, and the ANAF declaration generators.

---

## BLOCKERS (must fix before launch)

### B1. API-layer paywall bypass — every paid feature is free via the API
`src/middleware.ts:318-335`
The license gate (`licenseState` + redirect to `/app/onboarding`) runs **only** inside `if (pathname.startsWith('/app'))`. None of the 170 `/api/*` endpoints, the documented `/api/v1/*` API, or the Capacitor Bearer-token path check `locals.license.active`. A free user can `POST /api/invoicing/invoices`, submit real ANAF e-Factura, run reports, etc. The `/app` redirect is cosmetic and the 700 RON lifetime monetization is fully defeated.
**Fix:** add a shared `requirePaidLicense(locals)` guard at the top of every mutating paid endpoint, or enforce in middleware for `/api/*` + mutating method (excluding auth/checkout/webhook/onboarding/license-status). Gate the v1 API in `requireApiKey`/`lib/api-v1.ts`.

### B2. `/api/auth/token` bypasses email verification + account lockout + Turnstile
`src/pages/api/auth/token.ts:21` → `src/lib/auth.ts:301-319`
Verified: `token.ts` calls bare `loginUser()` then mints a Bearer session. `loginUser` never checks `emailVerified` and never records a failed attempt. So an unverified account gets a full session, and there is no per-account 5-fail/15-min lockout here — only the per-IP middleware throttle, which is itself bypassable because `getClientIp` trusts spoofable `x-forwarded-for` on Coolify (see H2). The endpoint is also CSRF-exempt and has no Turnstile. This is the weakest door into every account, including admin.
**Fix:** reuse the cookie-login branch logic from `[...all].ts`: `if (!user.emailVerified) return 403`; wrap in `checkLoginLockoutAsync`/`recordFailedLoginAsync`/`clearLoginAttemptsAsync(email)`; apply `verifyTurnstile`. Fix `getClientIp` in the same release.

### B3. Foreign-currency amounts declared as RON across all fiscal outputs
`src/lib/declaratii.ts:136-141,179-184`; `src/pages/api/invoicing/reports/d390.ts:129`; `src/lib/accounting.ts:355-357`; `src/lib/d406-saft.ts`
Verified at `declaratii.ts:136-141`: `line.baseCents += inv.subtotalCents; line.vatCents += inv.vatCents` with no FX conversion, then emitted as RON. All money is stored only in the invoice currency; the captured `bnrRate` is never applied. A 1.000 EUR base is reported to ANAF as 1.000 RON (≈5× understatement of VAT base and collected/deductible VAT) and the trial balance is corrupted. D390 (VIES — intra-EU is almost always EUR) is the worst exposure.
**Fix:** snapshot RON values at issue on `transport_invoices` and aggregate those in declarations, `d390.ts`, `postInvoice`, and SAF-T. Hard-fail issuing a non-RON invoice with no `bnrRate`. **Until then, gate foreign-currency invoicing OFF.**

### B4. Sales invoices never decrement stock
`src/lib/stock.ts` callers (verified: `grep` shows zero `invoicing/*` callers of `applyStockOut`)
`applyStockOut`/`applyStockIn` are called only from POS, gestiune transfer/receptions/counts, and purchase orders — never when goods are sold on a `factură`, the primary document of the product. Stock only ever goes up; on-hand quantities, the movement ledger, and SAF-T/stock figures are permanently wrong. The schema even reserves `stockMovements.refType='invoice'` but nothing writes it.
**Fix:** in the invoice issue/post path, for a goods-shipping `factura`/`aviz`, call `applyStockOut(cid, warehouseId, productId, qty, level.avgCostCents, {refType:'invoice', refId}, tx)` inside the issuing transaction, guarded by the issued-idempotency flag (storno reverses via `applyStockIn`). Fix the stock concurrency model (H10) first.

### B5. Production logging fully stripped → zero error capture
`astro.config.mjs:45-48` (verified: shared `esbuild: { drop: ['console','debugger'] }`)
Astro applies `vite.esbuild` to the SSR server build; committed `dist/server` chunks prove `logger.emit()` computes the line then discards it and cron catch-blocks compile to empty `catch {}`. `captureError()` logs via `log.error` → also silent, and `SENTRY_DSN` is unset by default. Every 500, failed ANAF/Stripe/email call, and cron exception vanishes — while middleware tells users "the team has been notified." You launch blind.
**Fix:** scope the drop to client bundles only (or remove it and rely on `logger.ts`'s `isProd` gate, or switch logger internals to `process.stdout.write`). Configure `SENTRY_DSN` and move env detection off Vercel-only vars.

---

## HIGH PRIORITY (fix before launch or immediately after)

**Security / authz**
- **At-rest secrets in plaintext** — `schema-pg.ts:23` (`totpSecret`), `:77` (reset/join token). DB leak = full 2FA bypass (incl. forced admin 2FA) + account takeover. Encrypt TOTP via `lib/crypto`, hash reset/join tokens like sessions. `enroll.ts:32`, `[...all].ts:369,395`.
- **H2. Spoofable client IP on Coolify** — `src/lib/security.ts:154-165`. Defeats every IP-keyed rate-limit + the lockout throttle. Read only the trusted Traefik header on `DEPLOY_TARGET=node`.
- **Missing `requireRole` on sensitive mutations** — `anaf/disconnect.ts:6-16`, `banca/transactions/[id].ts`, `anaf/etransport/declare.ts`, `mijloace-fixe/[id].ts` + `run-depreciation.ts`, `connectors/*`, `onboarding/company.ts:23-61`. A read-only `viewer` can disconnect ANAF, reconcile banking, declare e-Transport, run depreciation, rewrite the company fiscal profile. No cross-tenant leak, but the role contract is unenforced. Add the appropriate `requireRole` to each.
- **ZIP-bomb in e-Factura import** — `src/lib/efactura-parse.ts:44-57` (`unzipSync`, empirically 1024×). One 8 MB upload → ~8 GB → OOM-kills the single container. Cap decompressed size / entry count before inflating.

**Money / data integrity**
- **send.ts clobbers invoice status** — `invoices/[id]/send.ts:47` unconditionally `SET status='sent'`, flipping paid/reversed/overdue (fiscal-period reporting impact). Conditional `inArray(status,['draft','issued'])`.
- **Bank reconcile diverges from the payment ledger** — `banca/transactions/[id].ts:132-137` mutates `paidCents` with no `transportInvoicePayments` row; the next manual payment recomputes from SUM and erases the reconciled money. Insert a payment row in the same tx; wrap PATCH undo in a transaction.
- **Non-atomic idempotency, no unique constraints** — duplicate journal entries (double revenue/VAT) `accounting.ts:266-279`; duplicate card payments `webhooks/stripe.ts:71-101`, `netopia/[invoiceId].ts:97-131`; duplicate `BON` `pos/sales/index.ts:91-96`; duplicate NIR `receptions/index.ts`. Add partial unique indexes + insert-inside-tx + treat 23505 as benign.
- **Recurring cron double-bill** — `recurring-invoices.ts:40-41,150-155`, no run-lock; conditional `nextRunAt` claim or `pg_try_advisory_lock`.
- **advanceDate month-end overflow** — `recurring-invoices.ts:19-29`. Verified: Jan 31 +1mo → Mar 3 (February never billed). Clamp to last valid day, persist the anchor day.
- **Refund leaks the associate's revenue-share** — `admin/refund.ts:31-43` never calls `stripe.transfers.createReversal`. Reverse the `revenueSharePayouts` transfer on refund.
- **Lock-free stock read-modify-write** — `stock.ts:26-37,56-79,113-135`. Concurrent ops lose quantity + corrupt weighted-avg; first-write race aborts the whole document. Use `INSERT ... ON CONFLICT DO UPDATE` / `SELECT ... FOR UPDATE`.

**ANAF / fiscal correctness**
- **e-Transport XML rejected by ANAF v2 XSD** — `anaf/etransport.ts:186,195-209`. Rebuild against the official XSD; gate OFF until validated.
- **No duplicate-submission guard** — `efactura-submit.ts:17-112` + `anaf/efactura/submit.ts` + `invoices/index.ts:221-228`. The claimed `efacturaStatus` re-send guard is absent. Refuse upload when status is `submitted`/`validated`.
- **FX VAT double-count on import** — `efactura-parse.ts:95-97`. Sum only the TaxTotal matching `DocumentCurrencyCode`.
- **BR-CO-10 on fractional quantities** — `efactura.ts:188,208-209`. Print `InvoicedQuantity` at the precision used to compute the line net.
- **D390 goods/services miscoding** — `reports/d390.ts:129,156`. Map intra-EU services to P/T, not L/A.
- **D406 SAF-T non-submittable + FX-in-RON** — `d406-saft.ts:99,155,176,190-193`. Fix TaxCode/version/MasterFiles and emit RON-converted amounts. Keep labelled `orientativ`.
- **D300 ignores cash-VAT timing** — `declaratii.ts:119-143,271-274`. Report VAT proportional to amounts collected in-period for `tva_la_incasare`.

**API / ops / scale**
- **v1 invoice create not transactional** — `v1/invoices/index.ts:146-178`. Number gaps + lineless invoices. Wrap reserve+header+lines in one tx.
- **v1 scopes/test-mode/license/rate-limit gaps** — `lib/api-keys.ts:22-39`, `middleware.ts:171,216`. No read-only key, test keys do real fiscal writes, no paywall, GET unthrottled.
- **GDPR erasure never executes** — `me/delete.ts` + `cron/daily.ts` (no purge). PII retained indefinitely while the UI promises 30-day deletion. Implement the purge or correct the claim.
- **Analytics full-table cross-tenant scan** — `reports/analytics.ts:86-99`. Scope to period invoiceIds or aggregate in SQL.
- **pg.Pool max=10 + timeout=0** — `src/db/index.ts:20-25`. Saturates under ~12 concurrent report users and hangs forever. Tune `max`/`connectionTimeoutMillis`/`statement_timeout`.
- **Per-request Chromium PDF OOM** — `invoices/[id]/pdf.ts:35-65`. Reuse a browser / add a concurrency limiter; avoid the self-HTTP round-trip.
- **Crons only in vercel.json (Coolify ignores them)** — `vercel.json:7-11`. Overdue marking, recurring invoicing, dunning, ANAF token + e-Factura sync may never run in prod. Create them as Coolify Scheduled Tasks.
- **No prod DB backup** — `infra/SETUP.md:366` (assumes Neon, not the real Coolify Postgres). Automate `pg_dump` to S3/R2; document restore.
- **Recurring line editor stale VAT** — `RecurringManager.tsx:236` offers 0/5/9/19% only (no 21%/11%), so auto-generated invoices carry the wrong rate indefinitely. Use 21/11/9/5/0 or load from `/api/invoicing/tva`.

---

## MEDIUM (fast-follow)
- Storage-time HTML-encoding of names double-encodes into e-Factura/SAF-T XML (`security.ts:205-213`). Use `stripControlChars()` at storage, escape at render/XML.
- CSP `'unsafe-inline'` in `script-src` (`middleware.ts:105`) — move to nonce-based.
- Reverse-charge/exempt regimes not server-forced to VAT=0 + negative lines allowed on a `factura` (`invoices/index.ts:89,168`).
- Invoice issue date + D300/D394 period boundaries use server UTC day, not Europe/Bucharest (`invoices/index.ts:124-131`, `declaratii.ts:107-125`). Off-by-one at 00:00-03:00 RO. Set `TZ=Europe/Bucharest` and compute issue day in RO tz.
- County (`CountrySubentity`) and customer VAT-payer status inferred from free text/CUI presence rather than stored (`efactura.ts:69-79`, `efactura-submit.ts:73-77`).
- Broken `{{unsubscribe_url}}` in bulk campaigns; dunning emails omit creditor name + IBAN; dunning fires only on exact -3/0/+7 day offsets (`email-campaign.ts:112`, `dunning.ts:83-112,137-146`).
- 100%-off promo code = free lifetime license (`webhooks/stripe.ts:43-49` + `checkout/lifetime.ts:52`); public demo endpoint hands out a shared fully-licensed account (`demo.ts:12-46`).
- Reception/transfer/count/purchase-receive TOCTOU (read guard outside tx) double-count or push stock negative.
- Privacy policy names trade name not SOLAAS TECH S.R.L., lists no named sub-processors, is unversioned (`confidentialitate.astro:17-20,39-47,11`); no audit-IP retention; "Echivalent RON" inflated 100× in emit form (`InvoiceEmitForm.tsx:974`); VAT-regime dropdown cosmetic in client preview.
- No public health endpoint (`/admin/health` is behind login+2FA); stale `.env.example` (TransportHub/Neon/Vercel).

---

## What is genuinely solid (do not regress)
Tenant isolation across 40+ endpoints (no IDOR found); sha256-hashed sessions, bcrypt-12, OAuth state cookies, account-linking-requires-verified-email, HMAC-signed `th_imp`; atomic invoice numbering (`UPDATE...RETURNING`); correct per-line cents/VAT rounding and balanced double-entry with correct storno contra-entries; Stripe signature verification + idempotent lifetime grant + atomic credits ledger + Netopia fail-closed; verified Shopify/Woo HMAC; fail-closed constant-time `CRON_SECRET`; parameterized Drizzle queries (no SQLi), no XXE, no exploitable SSRF, magic-byte upload sniffing.