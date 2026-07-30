# PROJECT STATE — Zayjar Restaurant SaaS Platform

> Canonical engineering state document.
> Generation date: 2026-07-29 (Asia/Dubai). Independent audit corrections applied 2026-07-30 (full repository verification + live re-run of every test/type/build count).
> 2026-07-30 official-state update: sections §19–§28 added (Verification History, Open Blocking Defects, Quality Gate, Technical Debt, TODO, End-of-Session Procedure, Session Recovery, CTO Rules, Future Architecture, Session Completion Policy); Sprint-1 Step-4 live verification and Runtime Defects R4/R5 (both FIXED+VERIFIED) incorporated; all document-vs-repository contradictions corrected in place (see "Repository Corrections" note in §19 footer).
> Rule applied: every statement below is verified against the repository (file paths cited). Anything not verifiable from the repository is marked **UNKNOWN** or **CANNOT CONFIRM**. Nothing is speculative.

---

# 1. Project Overview

## 1.1 Project goal

Multi-tenant Restaurant SaaS platform. Verified scope identifiers from `DOC-001.md` and code comments: tenants (restaurant brands) with staff apps (Backoffice admin, Cashier POS), guest QR ordering channel (scan table QR → browse menu → checkout without account), Kitchen Display System (KDS) with realtime ticket events, and Stripe-based subscription billing with plan limits.

## 1.2 Current platform scope

- Monorepo (pnpm workspaces + Turbo), root `package.json`, `turbo.json`.
- Specification documents verified present at repo root: `DOC-001.md` … `DOC-010.md`, `SPEC_INDEX.md`, `IMPLEMENTATION_ROADMAP.md`, `TSK-0006_HEALTH_CHECK.md`.
- In-progress execution sprint: **Sprint 1 — public QR ordering channel end-to-end** (Steps 1–4 complete — Step 4 live-verified 2026-07-30 on a native runtime; **Step 5 final gate NOT started, awaiting approval** — plan recorded in commits `d1c6035`…`5967db9`).
- Post-Step-4 runtime defects: **R4 (PREX-MIG-001) and R5 (PREX-SEED-001) FIXED+VERIFIED 2026-07-30** (commits `c15843f`, `084dd37`); **R1/R2/R3 remain OPEN** (§20).
- Overall project status: Sprint 1 feature-complete pending final gate — see §6 (Current Sprint Status) and §21 (Quality Gate).

---

# 2. Repository Structure

Verified via `ls`:

```
apps/
  api/          NestJS 10 backend (listens on PORT, default 8000 — src/main.ts:71; docker-compose maps ${PORT:-8000}:8000)
  backoffice/   Next.js 14 admin app (compose maps host 3001:3000)
  cashier/      Next.js 14 POS app (compose maps host 3002:3000)
  qr-menu/      Next.js 14 guest QR ordering app (dev/start port 3000 per package.json; compose 3000:3000)
packages/
  db/           Prisma 5.22 schema + migrations + client + tenant repositories (@zayjar/db)
  types/        Shared enums/types (@zayjar/types)
  jest-preset/  Shared Jest preset (@zayjar/jest-preset: jsdom, @testing-library)
k8s/            Kubernetes manifests (api hpa 2–10 pods verified in k8s/api/hpa.yml)
nginx.conf      Production ingress reverse proxy at repo root (upstream api-core:8000)
docker-compose.yml / docker-compose.staging.yml / docker-compose.production.yml  Local/staging/prod stacks
docs/roadmap/   Supplementary planning docs
infra/cloudfront/  CDN infrastructure assets
tests/e2e/      Playwright e2e suites (root playwright.config.ts)
.github/workflows/  ci.yml (lint → test → build → docker) + cd.yml (production CD pipeline)
Root config: jest.config.js (root jest target of CI Job 2), tsconfig.json, docker-entrypoint.sh
Root non-spec docs: PROJECT_COMPLETION_REPORT.md, PROJECT_MANIFEST.md
```

Root scripts (verified `package.json`): `build` = `turbo run build`, `test` = `jest --runInBand --forceExit`, `lint` = `turbo run lint`. Engines: `node >= 20.0.0`.

---

# 3. Technology Stack

Verified from `package.json` files and build output:

| Layer | Technology | Version (declared) |
|---|---|---|
| Backend framework | NestJS (`@nestjs/core`, `@nestjs/common`) | ^10.3.8 |
| Auth/JWT | `@nestjs/jwt`, `jsonwebtoken`, `argon2` | ^11.0.2 / ^9.0.2 / ^0.45.0 |
| DB ORM | Prisma + `@prisma/client` | ^5.22.0 |
| Database | PostgreSQL 15 (schema targets: `Decimal`, `@db.Uuid`, `Timestamptz`) | `postgres:15-alpine` in docker-compose.yml |
| Cache/queue broker | Redis (ioredis, redis clients) | `redis:7.2-alpine`; clients ^5.11.1 / ^6.1.0 |
| Queue worker | BullMQ (DOC-010 §9.4 worker architecture) | ^5.81.2 |
| Frontend apps | Next.js | ^14.2.3 (14.2.35 resolved in pnpm-lock.yaml) |
| UI runtime | React, react-dom | ^18.3.1 |
| Realtime | socket.io (KDS gateway) | ^4.7.5 |
| Payments | stripe (api dep) | ^14.10.0 |
| Monorepo | turbo | ^1.13.3 |
| Tests | jest, ts-jest | ^29.7.0 / ^29.4.11 |
| Language | TypeScript | ^5.4.5 |
| CI | GitHub Actions, pnpm 9, Node 20 | `.github/workflows/ci.yml` (+ `cd.yml` production CD) |

---

# 4. Current Architecture

## 4.1 API (`apps/api`, NestJS)

- Global `TenantContextMiddleware` (`src/common/middleware/tenant-context.middleware.ts`): resolves tenant from `X-Tenant-ID` header → else Host subdomain (`*.zayjar.com`, `*.localhost`, ports stripped) → else custom domain (Redis-cached DB lookups). Missing tenant + non-platform-owner → 403. Wraps request in `dbTenantContext` AsyncLocalStorage.
- Other global middlewares, all `forRoutes('*')` and applied before tenant resolution (app.module.ts:48–55): `CorrelationIdMiddleware`, `HttpLoggingMiddleware`, `SanitizationMiddleware` (DOC-006 §5.4 XSS input sanitization).
- Guards: only global APP_GUARD is `CsrfGuard` (mutations only; skips `@Public()` routes and unauthenticated requests — verified `src/common/csrf/csrf.guard.ts`). `JwtAuthGuard` + `RbacPermissionGuard` are controller-level, bypass on `@Public()` via `IS_PUBLIC_KEY` reflector.
- Rate limiting: `RateLimitGuard` + `@RateLimit()` decorator (`src/common/rate-limit/`). Tiers (verified `rate-limit.service.ts` `getTierConfig`): **public 120/min, checkout 30/min, auth 10/min** per IP; Redis INCR/EXPIRE fixed window with in-memory fallback.
- Queue worker `src/worker.ts` (email/sms/push/webhook/websocket dispatch channels; BullMQ `Worker` cases verified lines 158–193).

## 4.2 QR Menu (`apps/qr-menu`)

- **Sprint 1 Step 3 state (committed 5967db9):** `src/app/page.tsx` is an async Server Component (`export const dynamic = 'force-dynamic'`). Reads `?t=<token>` from `searchParams`, resolves API base from incoming Host (`lib/guest-api.ts resolveServerApiBase`, env override `API_INTERNAL_URL`), SSR-fetches `GET /api/v1/public/menu?token=…` with `cache: 'no-store'`.
- `src/app/components/MenuBrowser.tsx` (`'use client'`): real cart (signature-merge, qty, removal, drawer, special notes), checkout POST to relative `/api/v1/public/orders/checkout`, confirmation view with server order number.
- `src/app/lib/`: `types.ts` (contract mirror of public API), `pricing.ts` (DOC-005 §4.3 rules), `guest-api.ts`, `format.ts`.
- `next.config.mjs`: `images.remotePatterns` (https any + localhost dev), `rewrites()` proxying `/api/*` → `API_INTERNAL_URL` (default `http://localhost:3001`) for local dev only — the dev default assumes the API on port 3001, which mismatches the API's default port 8000; see **LATENT-ENV-001** in §7.
- **No mock data anywhere in production src** (grep-verified 2026-07-29; re-verified clean 2026-07-30).

## 4.3 Cashier (`apps/cashier`)

- Next.js app, `CashierTerminal.tsx`; sends `X-Tenant-ID` header (verified lines 104, 258) and calls staff checkout `POST /api/v1/orders/checkout` (fetch at lines 253–258); reads `localStorage.accessToken` — the **only in-repo writer** of that key is the backoffice onboarding wizard (`RestaurantCreationWizard.tsx:253`, post-creation auto-login); there is **no standalone login screen** in any frontend (auth-UI gap — see §7 inventory and §15 item 5).

## 4.4 KDS

- Backend: `src/kds/kds.gateway.ts` (socket.io gateway, JWT-verified sockets with `JWT_CONFIG.accessTokenSecret`), `kds.service.ts` (REST ticket hydration), `kds.controller.ts`.
- Frontend: KDS terminal component lives in backoffice (`apps/backoffice/src/app/components/KDSTerminal.tsx`).

## 4.5 Backoffice (`apps/backoffice`)

- Next.js app; `AdminPanel.tsx` sends `X-Tenant-ID` (line 48); includes `RestaurantCreationWizard.tsx`, `KDSTerminal.tsx`.

## 4.6 Billing

- `src/billing/billing.controller.ts` (`api/v1/billing`), `billing.service.ts`: Stripe webhook `@Public()` with `STRIPE_WEBHOOK_SECRET` signature verification; subscription lifecycle statuses (TRIALING/ACTIVE/PAST_DUE/UNPAID/CANCELED enum verified in schema).

## 4.7 Authentication

- HS256 symmetric JWT currently (`src/auth/config/jwt.config.ts`: `JWT_SECRET`/`JWT_REFRESH_SECRET` env with fallback defaults — production refuses defaults by design, `accessTokenExpiry: '15m'`, `refreshTokenExpiry: '7d'`). Refresh rotation + Redis blacklist; argon2id password hashing; MFA via speakeasy.
- `@Public()` route decorator at `src/auth/decorators/public.decorator.ts`; CASL ability factory for RBAC; `@RequirePermission` decorator.
- **Spec deviation (documented inventory):** specification requires RS256 2048-bit; implementation is HS256. Migration decision recorded as deferred (session-approved; not yet in repository code).

## 4.8 Database (`packages/db`)

- Prisma schema `packages/db/prisma/schema.prisma`: **30 models, 9 enums** (verified counts; enums: TenantStatus, SubscriptionStatus, TableStatus, OrderType, OrderStatus, CookingStatus, PaymentMethodType, PaymentStatus, MediaType).
- `packages/db/src/index.ts` exports `prisma` (PrismaClient + `$extends` tenant-scoping extension), `prismaRead`, `dbTenantContext` (AsyncLocalStorage), generated client, repositories. Extension `unscopedModels = ['Tenant','SubscriptionPlan','AuditLog','Notification']`; injects `tenantId` into where/create; blocks createMany/upsert family; fail-safe error without context (`Fail-Safe Block`, src/index.ts:34).
- `BaseTenantRepository` + 16 tenant repositories (verified `src/repositories/` listing: 18 files incl. Base + index.ts), incl. `TenantTableRepository.findByQrCodeToken` (added Sprint 1 Step 2; tenant-scoped + `deletedAt: null`, lines 15–20).
- Seed: `packages/db/prisma/seed.ts` — 3 plans (plan-starter-001/growth-002/enterprise-003), demo tenant `albaik`, tables with `qrCodeToken` like `qr-albaik-r-1-<ts>`, full menu.

---

# 5. Completed Work

Organized by sprint/step. Commit stats are the verification anchor (exact file counts + insertions/deletions reproduced identically across session re-creations).

| Sprint | Step | Commit (current local) | Content | Verification at completion |
|---|---|---|---|---|
| Sprint 1 | Step 1 — public guest read API | `d1c6035` | 4 files, 629+/2− — `menu/public-menu.service.ts`, `menu/public-menu.controller.ts` (`GET /api/v1/public/table/:token`, `GET /api/v1/public/menu?token=…`), controller spec (15 tests), `menu.module.ts` registration | menu suites 23/23; ESLint 0; tsc 0 new errors (149 pre-existing unchanged); full api 478/1-fail(pre-existing)/2-skip (measured at Step 2 gate) |
| Sprint 1 | Step 2 — guest checkout + DEFECT-A + DEFECT-B | `0741d5b` | 8 files, 710+/24− — `public-order.controller.ts` (new), `order.service.ts`, `create-order-request.dto.ts`, `order.module.ts`, `TenantTableRepository.ts`, 3 spec files | order 50/50, menu 23/23, kds 41/41, full api 478 passed / 1 documented pre-existing failure / 2 skipped; ESLint 0; tsc 149→145 (4 removed on touched lines, 0 added); db tsc unchanged at 16 |
| Sprint 1 | Step 3 — qr-menu SSR + real cart + checkout wiring | `5967db9` | 10 files, 1157+/269− — `page.tsx` SSR rewrite, `MenuBrowser.tsx` cart/checkout + `MenuBrowser.spec.tsx` updates, new `lib/` (4 source files + 2 specs), `next.config.mjs` | qr-menu build PASS (route `/` = ƒ Dynamic SSR in build output); qr-menu tests 28/28 (3 suites); zero mock data remains in production src (grep-verified); api order 50/50 + menu 23/23 regression green |
| Sprint 1 | Step 4 — live end-to-end verification | — (verification-only; zero repo changes) | Native runtime substituted for absent Docker: PostgreSQL 17.10 + Redis 8.0.2 + API `dist/main.js` :8000 + qr-menu `next dev` :3000 + `/etc/hosts` tenant subdomain; fixture-based data (repo seed then non-executable → R5) | ✅ VERIFIED 2026-07-30: menu/table GETs 200 (Decimal→Number, branding); uniform anti-oracle 404; 403 no-tenant; gating UNPAID/CANCELED→403 vs PAST_DUE/ACTIVE→200; 4× checkout 201 with server totals (42.55 / 5.75 / 11.50 / 16.67 — last via qr-menu rewrite proxy = browser path); `tableId` server-forced; `kitchen_queues` rows; WS `ticket.created` real names; SSR branding + error views; **1 CANNOT VERIFY** (pointer cart clicks — no browser automation; covered via proxy path). Side findings: R1 CONFIRMED, R2–R5 red, LATENT-ENV-001 confirmed, LATENT-MEDIA-001 runtime fear disproven. Evidence: `/home/user/e2e/` (outside repo) |
| Post-Step-4 | Runtime Defect R4 (PREX-MIG-001) fix | `c15843f` (local, pre-push) | 2 files, 10+/5− — `20260726100001_add_lifecycle_triggers/migration.sql` identifier corrections + PROJECT_STATE.md record | ✅ VERIFIED 2026-07-30: 8/8 triggered tables accept UPDATEs (backdate-probe override); audit conditional + literals preserved; `PUT /api/v1/orders/:id/status` → HTTP 200 (Step-4: 500); api suite 275 pass / 2 skip / 1 pre-existing fail = baseline |
| Post-Step-4 | Runtime Defect R5 (PREX-SEED-001) fix | `084dd37` (local, pre-push) | 2 files, 107+/102− — `seed.ts` 93 deterministic UUID IDs + PROJECT_STATE.md record | ✅ VERIFIED 2026-07-30: complete fresh-DB seed ×2 via canonical `pnpm prisma:seed`; demo tenant/restaurant/products/categories/QR tokens SQL-verified; db lint 0, db tsc 16, api suite 275/2/1 = baselines |
| Post-Step-4 | Runtime Defect R1 (LATENT-KDS-001) fix | see §19 row 7 (local, pre-push) | 2 files — `kds.service.ts:76` one-line relation ordering + PROJECT_STATE.md record | ✅ VERIFIED 2026-07-30: tsc kds 6→1 / api 145→140 (0 added); kds 41/41 + full api 275/2/1 = baselines; live `GET /api/v1/kds/tickets` → HTTP 200 (was 500), oldest-first order, status filter + hydration + 404 path intact |

Pre-Sprint-1 baseline (upstream `df51f37` "Fix restaurant setup flow" and earlier): full platform scaffolding — monorepo, all four apps, DB schema + tenant extension, auth/JWT, billing, KDS gateway, CI, k8s, docs.

---

# 6. Current Sprint Status

**Sprint 1 — "Public QR Ordering Channel fully functional end-to-end":**

| Step | Status |
|---|---|
| Step 1 — public guest read API | ✅ Complete (committed) |
| Step 2 — checkout token verification + DEFECT-A + DEFECT-B | ✅ Complete (committed) |
| Step 3 — qr-menu SSR/cart/checkout | ✅ Complete (committed) |
| Step 4 — e2e/local live verification | ✅ Complete 2026-07-30 — executed on a **native runtime substituted for absent Docker** (PostgreSQL 17.10 + Redis 8.0.2 + API :8000 + qr-menu :3000; §17 degraded path honored); results + 1 CANNOT VERIFY item in §19 row 4; evidence `/home/user/e2e/` |
| Step 5 — final gate (lint 0, suites green, `turbo build`, final commit) | ⏸ Not started — awaiting explicit approval. **Known gate risk: PREX-TSC-001/002 make the `turbo build` criterion fail on main today (§21)** |

Post-Step-4 approved fixes (one isolated commit each): **R4 `c15843f`**, **R5 `084dd37`**, **R1 (see §19 row 7)** (all 2026-07-30 — details §5 table and §19). Remaining verified runtime defects: **R2 = PREX-MIG-002, R3 = PREX-MIG-003** — both OPEN, awaiting fix-scope decisions (§20).

**Repository safety note (verified repeatedly — 5+ sandbox wipe cycles by 2026-07-30):** the session sandbox periodically wipes `.git/config` (including remote + identity), `node_modules`, `dist/`, and **locally created commits**; working-tree file contents survive. All sprint/fix commits have been deterministically re-created from file contents each time (stat-identical). Durable persistence requires a push to GitHub. **Push policy (user directive, 2026-07-30 — supersedes the earlier "blocked: no remote/credentials" phrasing):** pushes are performed personally by the user; the session never pushes and never requests credentials. `origin` (`https://github.com/amarspk/zayjar-specification.git`) is re-added in-session as needed — `.git/config` is snapshot-excluded, so its presence is not durable. Wiped-and-recreated local hashes on record (identical contents/stats, new timestamps): R4 = `8b65531` → `4ab74e0` → **`c15843f`**; R5 = `1325e95` → **`084dd37`**.

---

# 7. Known Defects

| ID | Description | Status | Affected modules |
|---|---|---|---|
| DEFECT-A | `variantId` was stored on order items but variant price never applied (pricing used basePrice + sizeAdjustment only), violating DOC-005 §4.3 Condition C absolute override | **FIXED in Step 2** (`order.service.ts:172–180` pricing loop: variant absolute price, `stockQuantity<=0` rejection, size skipped when variant selected; unit tests `order.service.spec.ts:623/668/695` + integration P5) | order |
| DEFECT-B | Transaction `include` carried only `orderItemAddons`; WS `ticket.created` payload read `item.product?.name` → `undefined` → "Unknown Product" on live KDS tickets | **FIXED in Step 2** (post-transaction name-resolution read at `order.service.ts:291`, response payload byte-identical; tests `order.service.spec.ts:714` + `:781` + real-gateway integration) | order → kds |
| PREX-E2E-001 | `src/common/e2e.spec.ts` "E2E Verification 1: Tenant Onboarding" fails with `Fail-Safe Block: Access to model 'User' was blocked due to missing tenant context` (`packages/db/src/index.ts:34`). Proven pre-existing on pristine HEAD via stash test; reproduced in live full-suite run 2026-07-30 | OPEN (documented, not sprint scope) | common (e2e spec), db extension |
| PREX-TSC-001 | Pre-existing TypeScript debt in `apps/api`: **140 errors currently** (149 at Sprint-1 start; −4 removed on Step-2-touched lines; **−5 removed by the R1/LATENT-KDS-001 one-line fix on 2026-07-30** — its own TS2353 plus 4 knock-on collapses in the same module; 0 introduced by Sprint 1 — re-verified 2026-07-30). `tsc` is the api `build` script → **production build (`pnpm build`) and CI Job 3 "Build Verification" fail on main** (verified: build script `tsc`, tsconfig includes `src/**/*`, CI runs `pnpm build`; Dockerfile api builder runs `pnpm run build`) | OPEN (legacy; remediation belongs to a dedicated build-gate task) | api-wide; per-module counts (fresh `tsc --noEmit`, 2026-07-30, post-R1): media 24, billing 23, order 15, audit 15, common 15, auth 10, subscription 8, tenant 7, notification 7, **kds 1** (`kds.controller.ts:46` TS2322 — pre-existing on an untouched line), device-token 6, worker 4 (`src/worker.ts`), payment 2, webhook/asset/admin 1 each — sums to exactly 140 |
| PREX-TSC-002 | `packages/db` tsc: **16 pre-existing errors** (`BaseTenantRepository` delegate type vs generated-client `Exact<>` types; dist still emitted) — re-verified 2026-07-30 | OPEN (legacy) | db |
| PREX-MIG-001 (Runtime Defect R4) | Migration `20260726100001_add_lifecycle_triggers` wrote triggers against snake_case columns that exist nowhere in the schema: `update_updated_at()` set `NEW."updated_at"` (real: `"updatedAt"` on all 8 models, no `@map`) → **every UPDATE failed on all 8 triggered tables** (tenants, users, branches, products, orders, customers, subscriptions, media): psql `record "new" has no field "updated_at"`; API `PUT /api/v1/orders/:id/status` → HTTP 500 (entire order state machine dead at runtime). Same disease in `log_order_status_change()`: insert into `audit_logs` used `tenant_id/user_id/entity_name/entity_id/old_values/new_values/ip_address/user_agent/created_at` (real: camelCase per `schema.prisma` AuditLog) + read `NEW."tenant_id"` | **FIXED 2026-07-30** — identifier-only rewrite (function/trigger names, BEFORE/AFTER timing, 8-table set, `IS DISTINCT FROM` guard, literal values `'STATUS_CHANGE'/'Order'/NULL/'system'/'database-trigger'`, webhooks exclusion all preserved). Live-verified on PostgreSQL 17.10 verification DB: all 8 tables accept UPDATEs with trigger overriding `updatedAt` (backdate probe → ~now()); non-status order UPDATE writes zero audit rows; status changes DRAFT→PENDING (psql) and PENDING→ACCEPTED (API `PUT` → HTTP 200) each wrote exactly one correct `STATUS_CHANGE` audit row; app-level audit row also logged; full api suite re-run = 275 pass / 2 skipped / 1 pre-existing fail (byte-identical baseline → no regression) | db (migrations), api (all UPDATE paths) |
| PREX-SEED-001 (Runtime Defect R5) | `prisma/seed.ts` used 93 hardcoded non-UUID slug IDs (`plan-starter-001`, `tenant-demo-001`, `role-owner-001`, `user-admin-001`, `rest-albaik-001`, `branch-albaik-riyadh-001`, `cat-appetizers-001`, …) for PKs that are all `String @db.Uuid` (schema-verified: every model `id` is `@id @default(uuid()) @db.Uuid`) → canonical `pnpm --filter @zayjar/db prisma:seed` failed at `seed.ts:45` (`subscriptionPlan.create`) with Prisma **P2023** `Error creating UUID, invalid character: expected an optional prefix of urn:uuid: followed by [0-9a-fA-F-], found 'p' at 1` (verbatim, reproduced 2026-07-30 on fresh DB). Secondary nuance: bare `prisma db seed` invoked without pnpm PATH additionally fails `spawn ts-node ENOENT` — the canonical pnpm script is the working invocation | **FIXED 2026-07-30** — data-only fix confined to `seed.ts` (105 insertions / 101 deletions): all 93 slug IDs (79 PK literals + 14 permission-data entries) replaced by deterministic, schema-valid UUIDs derived from the original slugs (sha256, v4-shaped → reproducible across clean databases); cross-references updated consistently (6 `sizeId` + 1 `addonItemId` literals; permission template → `p.id`); provenance comment added; **zero logic/enum/field changes** (all enums/fields schema-verified beforehand: `PaymentMethodType.CASH`, `CookingStatus`, `TenantStatus`/`SubscriptionStatus`, `TableStatus`, RolePermission/UserRole composite `@@id`, ProductVariant.tenantId required, Invoice.order `Restrict`, others `Cascade`). Live-verified PostgreSQL 17.10 fresh DB `zayjar_seed2` (M1/M2/M3 + corrected M6): full seed completes (`plans 3, tenants 2, subscriptions 2, users 5, roles 4, permissions 14, restaurants 2, branches 3, tables 14, categories 7, products 14, productSizes 12, productVariants 6, customers 3, orders 3, orderItems 6`); immediate re-run clean (FK-cascade cleanup); verified demo tenant `albaik` ACTIVE (`80a00898-…`), restaurant Al-Baik Chicken SAR 15.00%, 11 tenant-1 products, 5 tenant-1 categories, 14 QR tokens (`qr-albaik-r-*` ×8 / `qr-albaik-j-*` ×6, `deletedAt` NULL) | db (seed) |
| PREX-MIG-002 (Runtime Defect R2) | Migration `20260726000001_orders_partitioning_by_year` **fails on apply**: `column "created_at" named in partition key does not exist` — real column is `"createdAt"` (schema-verified). Same snake_case disease family as R4, unpatched | OPEN — CONFIRMED 2026-07-30 (Step-4 live run); fix not approved, scope deferred | db (migrations), orders partitioning |
| PREX-MIG-003 (Runtime Defect R3) | Migration `20260726100000_add_search_indexes` **fails at line 14**: `column "tenant_id" does not exist` — real column `"tenantId"`. Partial apply left drift: `products.tsv_menu_search` column present, its indexes absent | OPEN — CONFIRMED 2026-07-30 (Step-4 live run); fix not approved, scope deferred | db (migrations), search indexes |
| LATENT-KDS-001 (R1) | `kds.service.ts:76` `orderBy: { createdAt: 'asc' }` on `KitchenQueue`, a model with **no `createdAt` column** (schema verified) → Prisma `ArgumentValidationError` on KDS REST ticket list. Static corroboration: same line was pre-existing tsc error **TS2353** (`kds.service.ts(76,20)`); 4 further kds-module tsc errors (:100 TS2551, :107/:141/:143 TS7006) were knock-on type collapses of the same invalid query | **FIXED 2026-07-30** — one-line relation ordering `orderBy: { order: { createdAt: 'asc' } }` (semantics match component design: ticket `createdAt`/elapsed already derive from `order.createdAt` at :101/:139). tsc: kds-module 6→1 (remaining `kds.controller.ts:46` TS2322 is pre-existing on an untouched line — NOT fixed per Option-B), api total **145→140**, 0 added. Suites: kds 41/41 (4 suites), full api 275/2/1 = baseline. **Live-verified** (PostgreSQL 17.10, DB `zayjar_r1`, newest-first inserted rows): `GET /api/v1/kds/tickets?branchId=…` → **HTTP 200** (pre-fix: 500), tickets returned oldest-order-first, COMPLETED-order ticket excluded (status filter intact), full hydration (`E2E Classic Burger` qty 2 / size `Large` / addons `[Cheese]`; `E2E Fries`; elapsedMinutes 177/117; RUSH escalations broadcast), unknown branch → 404, zero `Unknown argument` in API log | kds |
| LATENT-MEDIA-001 | `media.service.ts:112` TS2552 `Cannot find name 'urls'` → previously feared ReferenceError if that branch executes. **Correction 2026-07-30 (Step-4 evidence): runtime hazard disproven** — `let attemptUrls: typeof urls;` is a type annotation; emitted `dist/media/media.service.js:105` is a bare declaration `let attemptUrls;` → compile-time TS2552 only | OPEN (compile-time type debt — counted inside PREX-TSC-001; runtime claim corrected 2026-07-30) | media |
| LATENT-TEN-001 | ~~`tenant.service.ts` reads `.branding` from a `SubscriptionPlan`-shaped object~~ — **AUDIT-VERIFIED NON-ISSUE (2026-07-30):** every `.branding` access in `tenant.service.ts` targets the `Tenant` model, which owns the column (`schema.prisma:99`): `:236` (`prismaRead.tenant.findUnique` result), `:304` / `:313` (`prisma.tenant.*` results, lines 295–305 are DTO-side by design). `SubscriptionPlan` indeed has no `branding` (verified, 0 occurrences), and no code ever reads it | **CLOSED — not a defect** (former suspicion disproven by audit) | tenant |
| LATENT-SUB-001 | `subscription.service.ts:114–116` dereferences `subscription.plan` after `as … \| undefined` cast without guard (`!plan.allowCustomDomains` at :116) → TypeError if plan missing at runtime; second unguarded site `:102` (`plan.name` after cast at :86); correctly guarded counterpart exists at :61 | OPEN (data-dependent) | subscription |
| LATENT-ENV-001 | Dev-port mismatch: qr-menu dev defaults assume the API on **port 3001** (`apps/qr-menu/src/app/lib/guest-api.ts:111–123`; `next.config.mjs` rewrite default `http://localhost:3001`), while the API listens on `PORT \|\| 8000` (`apps/api/src/main.ts:71`) and docker-compose maps `${PORT:-8000}:8000` → local dev outside compose without `PORT`/`API_INTERNAL_URL` set misroutes SSR fetches and the browser `/api` rewrite proxy | OPEN — **CONFIRMED 2026-07-30 (Step-4 live run):** with default env the SSR page renders the error view (fetch to `:3001` refused while API on `:8000`); `API_INTERNAL_URL=http://albaik.localhost:8000` makes the same page green. Canonical port decision pending | qr-menu ↔ api |
| ENV-TSK-0006 | Native/install build scripts blocked by pnpm script approval (`@prisma/client`, `@prisma/engines`, `prisma`, `argon2`, `sharp`) — class described in `TSK-0006_HEALTH_CHECK.md`; sandbox workaround recorded in §18 (argon2 node-gyp rebuild; shipped `argon2.glibc.node` prebuild segfaults under glibc 2.41 — segfault reproduced live 2026-07-30, rebuild fixed it) | OPEN (documented) | db, api (auth), media (sharp) |
| SPEC-DRIFT inventory (documented in session audit) | RS256 (spec) vs HS256 (code); QR page spec says SSR vs previous mock CSR (RESOLVED Step 3); Socket.io Redis adapter claimed in `SPEC_INDEX §7.6` but absent in code (`createAdapter` grep = 0) while `k8s/api/hpa.yml` scales API 2–10 pods; FCM log-only stub (`device-token.service.ts`, no `firebase-admin` dep); DOC-006 §5.6 "Token Bucket" title vs fixed-window code; DOC-003 nested menu paths vs flat code routes; ~16 shipped routes undocumented in DOC-003; `notifications` table lacks FK/relation/repository; Tailwind/Radix mandated by docs but absent; README clone URL wrong (`zayjar/platform-core`); README says "29 tables" vs 30 models verified; KDS room-naming drift: SPEC_INDEX `tenant_id:branch_id:kds` (:276) / `tenant_id:branch_id` (:445) vs code `tenant:{tenantId}:branch:{branchId}` (`kds.gateway.ts:82`) | OPEN (documentation/decision backlog for Sprint-3 doc baseline) | cross-cutting |

---

# 8. Existing API Contracts

**Public (unauthenticated) contracts currently implemented** (`@Public()` verified in each controller). All tenant-scoped via `TenantContextMiddleware` (Host subdomain / custom domain / `X-Tenant-ID`).

## 8.1 `GET /api/v1/public/table/:token` (Sprint 1 Step 1)
- Guard-free (`@Public()`), `@RateLimit('public')` (120/min/IP).
- Response: `{ table: { number }, branch: { id, name }, restaurant: { name, currency }, tenant: { name, logoUrl, bannerUrl, primaryColor, secondaryColor } }`.
- 403 when tenant subscription `UNPAID`/`CANCELED` (DOC-001 §1.10); uniform 404 for unknown/expired token (no existence oracle).

## 8.2 `GET /api/v1/public/menu?token=…` (Sprint 1 Step 1)
- `@Public()`, `@RateLimit('public')`.
- Response: table/branch/restaurant/tenant projection (as 8.1) + `categories[].products[]` with `sizes[]`, `variants[]` (`price`, `stockQuantity`), `addons[]` groups with `options[]`; filters `isActive/deletedAt/isAvailable` server-side; single nested relational query; Decimal→Number mapping.

## 8.3 `POST /api/v1/public/orders/checkout` (Sprint 1 Step 2)
- `@Public()`, `@RateLimit('checkout')` (30/min/IP). `PublicOrderController` in OrderModule.
- Body (`CreateOrderRequestDto`, class-validator whitelist + forbidNonWhitelisted): `{ branchId, qrCodeToken (required here), type: 'DINE_IN'|'TAKE_AWAY'|'DELIVERY', items: [{ productId, quantity≥1, sizeId?, variantId?, addons?: [{ addonItemId }] }], paymentMethod: 'CASH'|'CREDIT_CARD'|'APPLE_PAY'|'LOCAL_WALLET', tableId?, specialNotes? }`.
- Behavior: verifies `qrCodeToken` via `TenantTableRepository.findByQrCodeToken` (tenant-scoped, `deletedAt:null`); explicit branch/table mismatch → 400; unknown token → uniform 404; branch/table forced server-side; then identical staff pipeline (server-computed pricing incl. variant absolute override + stock validation; atomic tx order + kitchen queue entry; WS `ticket.created` with resolved names; legacy `order.created` broadcast).
- Response: HTTP 201 (explicit `@HttpCode(HttpStatus.CREATED)`), persisted order record (`id`, `orderNumber` `ORD-YYYY-NNNNN`, `status: 'PENDING'`, totals incl. tax from restaurant `taxPercentage`, `orderItems`). CSRF: global guard bypasses `@Public()` routes — cookie-less guest POST passes (verified `csrf.guard.ts`).

## 8.4 Pre-existing public endpoints (unchanged by Sprint 1)
- `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh` (`@Public()`, auth tier 10/min).
- `POST /api/v1/billing/webhooks` (`@Public()`, Stripe signature via `STRIPE_WEBHOOK_SECRET`).
- `POST /api/v1/customers` (`@Public()`, registration; tenant from middleware, never client payload).
- `POST /api/v1/tenants`, `GET /api/v1/tenants/plans` (`@Public()`).

## 8.5 Authenticated staff surface (context only, unchanged)
- `POST /api/v1/orders/checkout` (JwtAuthGuard + RBAC `create:Order`, checkout tier) — signature and behavior byte-identical after Step 2 (verified by unmodified staff test #18 `tableId` passthrough among 23 pre-existing integration tests).

---

# 9. Database Status

- **Tables: 30 models** in `packages/db/prisma/schema.prisma` (README's "29 tables" is stale — see SPEC-DRIFT).
- **Enums: 9** (names in §4.8).
- **Migrations:** baseline committed at `packages/db/prisma/migrations/` (6 migrations + `migration_lock.toml`: `20250101000000_init`, `20260725000000_add_media_model`, `20260726000000_add_tenant_branding_jsonb`, `20260726000001_orders_partitioning_by_year`, `20260726100000_add_search_indexes`, `20260726100001_add_lifecycle_triggers`). **Applied state (corrected 2026-07-30 — previously "UNKNOWN, no runtime in sandbox"):** M1 (`init`), M2 (`add_media_model`), M3 (`add_tenant_branding_jsonb`) and M6 (`add_lifecycle_triggers`, post-R4-fix) **verified clean-applying** on two independent live PostgreSQL 17.10 verification DBs; **M4 (`orders_partitioning_by_year`) and M5 (`add_search_indexes`) FAIL on apply** (PREX-MIG-002 / PREX-MIG-003, verbatim errors in §7). Production/provisioned-DB applied state remains UNKNOWN (no access). Seed script exists (`prisma/seed.ts`) with demo tenant `albaik` — **executable since 2026-07-30** (PREX-SEED-001 / R5 below): full fresh-DB seed + re-run verified. **Update 2026-07-30:** `20260726100001_add_lifecycle_triggers` corrected and live-verified (PREX-MIG-001 / R4 above): applies clean and executes correctly on PostgreSQL 17.10 (all 9 triggers live: 8× `set_updated_at` BEFORE UPDATE + `log_status_change` AFTER UPDATE on `orders`). Verified via session verification DB `zayjar_r4` (M1/M2/M3 + corrected M6 applied by psql; M4/M5 excluded from that session's scope); production/provisioned-DB applied state otherwise remains as stated.
- **Relations/constraints (verified highlights):**
  - `Tenant` is tenancy root; most models carry `tenantId String @db.Uuid`; relation cascades tenant-side (`onDelete: Cascade` on `Table.tenant`, `KitchenQueue.tenant`, etc.).
  - `Table.qrCodeToken` — `@@unique` (`idx_tables_qr_token`); `Table` has `deletedAt` (soft delete; public lookups filter `deletedAt: null`).
  - `Tenant.subdomain`, `Tenant.customDomain` unique (drives middleware resolution); `Tenant.branding Json? @default("{}")` exists (schema:99); `SubscriptionPlan` has NO `branding` (verified 0 occurrences — see LATENT-TEN-001 closure).
  - `ProductVariant` (`price Decimal(10,2)`, `stockQuantity Int @default(0)`): `@@unique([sku])`, `@@index([productId])`; relation to `OrderItem[]`.
  - `KitchenQueue`: fields `id, tenantId, branchId, orderId, ticketNumber, priority, startedCookingAt, completedCookingAt` — **no `createdAt`** (see LATENT-KDS-001).
  - `SessionLog`: refresh-token hash store (`isRevoked`).
  - Unscoped (globally readable) models via tenant extension: `Tenant`, `SubscriptionPlan`, `AuditLog`, `Notification`.
- Generated client: committed at `packages/db/src/generated-client` (binaryTargets include `debian-openssl-3.0.x`, also `native` and `windows`; 21 tracked files) and copied into `dist/generated-client` by `scripts/copy-generated-client.js`.

---

# 10. Frontend Status

## 10.1 QR Menu (`apps/qr-menu`)
- **Step 3 complete.** SSR server component page (ƒ Dynamic per build output), zero mocks, real branding/table/menu from Step-1 API, real cart, checkout wired to Step-2 endpoint, confirmation view, error views (missing token / 403 subscription pause / unresolvable token).
- Build: PASS (type-checked, `next build` exit 0 — re-verified 2026-07-30). Tests: 28/28 (3 suites — re-verified 2026-07-30). Lint: clean via build's lint phase.
- Legacy `?table=` display param removed; token param is `?t=`.

## 10.2 Cashier (`apps/cashier`)
- Unchanged by Sprint 1. Terminal sends `X-Tenant-ID` (verified lines 104, 258); checkout call to staff endpoint at `CashierTerminal.tsx:253–258`; reads `localStorage.accessToken`. The only in-repo writer of that key is the backoffice onboarding wizard (`RestaurantCreationWizard.tsx:253`) — no standalone login screen exists in any frontend (auth-UI gap, see §15 item 5).

## 10.3 Backoffice (`apps/backoffice`)
- Unchanged. Admin panel + RestaurantCreationWizard + KDSTerminal components present; sends `X-Tenant-ID` (AdminPanel.tsx:48).

## 10.4 KDS
- Frontend component in backoffice (above); receives WS events in rooms `tenant:{tenantId}:branch:{branchId}` (kds.gateway.ts:82); `ticket.created` payload post-Step-2 contains resolved names (orderItemId, name, quantity, size, addons, cookingStatus).

---

# 11. Backend Status

- Order pipeline (post Step 2): server-side pricing (product availability, variant absolute override incl. stock validation, size adjustment, addons, tax from restaurant `taxPercentage` at `order.service.ts:230`, `discountAmount = 0.00` placeholder comment at line 232 — intentional, documented in code), atomic transaction (`order` + `kitchenQueue`), KDS broadcast (`ticket.created` canonical + `order.created` legacy alias), state machine guarded transitions + invoice on COMPLETED (invoice `pdfUrl` currently a fabricated CDN string per `order.service.ts:451` — known placeholder noted in audit inventory; out of Sprint-1 fix scope).
- Menu: staff CRUD + (new) public guest read.
- KDS: gateway (join/leave branch rooms, JWT-verified sockets), REST ticket list (see LATENT-KDS-001), priority escalation logic.
- Billing: webhook-driven subscription status updates.
- Media/auth/notification/worker/webhook modules: unchanged; notification email/SMS/push dispatch with queue worker.

---

# 12. Security Status

Implemented (verified): tenant isolation via middleware + DB extension + ALS context; `Fail-Safe` block without context; uniform 404 anti-oracle on guest token surface; rate limiting tiers; CSRF guard with public bypass; global input sanitization middleware (DOC-006 §5.4, `SanitizationMiddleware`); argon2id hashing; refresh-token rotation + blacklist; CASL RBAC; subscription lifecycle gating on guest channel (UNPAID/CANCELED → 403); server-authoritative order binding (DOC-005 §4.6); HMAC-SHA256 QR token generation (`branch.service.ts:50–60`, `SYSTEM_PEPPER` env with fallback default string).

Known gaps (documented, not addressed in Sprint 1): HS256 vs spec RS256 (deferred by decision); QR token pepper fallback default `'zayjar-default-pepper-999!'` hardcoded fallback in code (branch.service.ts:51); invoice `pdfUrl` fabricated (order.service.ts:451); spec-drift items in §7; `X-Tenant-ID` header accepted as manual tenant override by middleware (dev header honored in any environment where reachable); dev-port mismatch (LATENT-ENV-001).

Secrets state in-repo: `main.ts:8` `REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET']`; non-production defaults exist in code as development fallbacks; production startup refuses missing JWT secrets (jwt.config.ts) and missing required envs (main.ts).

---

# 13. Testing Status

| Suite group | Last verified result (re-verified live 2026-07-30) | Command |
|---|---|---|
| api `src/order` (unit + HTTP integration) | 50/50 PASS | `cd apps/api && npx jest src/order --config jest.config.js` |
| api `src/menu` | 23/23 PASS | same pattern, `src/menu` |
| api `src/kds` | 41/41 PASS | same pattern, `src/kds` |
| api full | **478 passed / 2 skipped / 1 failed, 481 total (57 suites)** (1 = PREX-E2E-001, pre-existing) | `cd apps/api && npx jest --config jest.config.js` |
| api via repo script | `pnpm --filter @zayjar/api test` = 275 passed / 2 skipped / 1 failed (278 total) (script glob `jest src/**/*.spec.ts` expands only two levels deep under `sh` — pre-existing script semantics; same single failure) | `pnpm --filter @zayjar/api test` |
| qr-menu | **28/28 PASS (3 suites)** | `pnpm --filter @zayjar/qr-menu test` |
| qr-menu build | PASS (ƒ Dynamic `/`, exit 0) | `pnpm --filter @zayjar/qr-menu build` |
| ESLint `@zayjar/api` package | 0 errors (exit 0) | `npx eslint "src/**/*.ts"` |
| tsc `apps/api --noEmit` | **140 errors**, exit 2 (all pre-existing legacy; 0 from Sprint 1 — re-verified 2026-07-30; −5 attributable to the R1 fix line and its knock-ons) | `cd apps/api && npx tsc --noEmit` |
| tsc `packages/db` | 16 errors (pre-existing; emits dist regardless) | `cd packages/db && npx tsc` |
| CI status on main (remote) | UNKNOWN (no access to Actions history); by construction Job 3 (`pnpm build`) fails on PREX-TSC-001/002 | — |
| ESLint `@zayjar/db` (incl. `prisma/seed.ts`) | 0 problems (exit 0) — captured pre-R5-edit and re-run post-edit identical, 2026-07-30 | `pnpm --filter @zayjar/db lint` |
| Seed execution (live) | ✅ completes on fresh PostgreSQL 17.10 DB, twice in a row (2026-07-30, fix `084dd37`); entity counts in §7 PREX-SEED-001 | `DATABASE_URL=… pnpm --filter @zayjar/db prisma:seed` |

**Notes:** (1) CI Job 2 executes **root** `pnpm test` → root `jest.config.js` (`testMatch: '**/*.spec.ts'`, node environment, `tests/e2e/` ignored), which collects a different set than the per-package commands above. (2) The CI row covers both `.github/workflows/ci.yml` and `cd.yml` — neither is verifiable by us (no GitHub access). (3) The 2 skipped api tests are DB-gated conditional describes (verified site: `media-concurrency.integration.spec.ts:33` `describeIfDb = DATABASE_URL ? describe : describe.skip`, skipped while `DATABASE_URL` is unset); per-test itemization of both skipped cells beyond this site: CANNOT CONFIRM from aggregate output alone.

---

# 14. Engineering Decisions

Only decisions verifiable from repository history (commits + code comments):

1. `d1c6035` — Public guest surface implemented as a separate class-guard-free `PublicMenuController` with explicit `@Public()` + per-handler rate limits + controller-level `requireTenantContext` fail-safe (tenantId injected into service calls); safe projections only (no internal fields exposed).
2. `0741d5b` — Guest checkout placed in `PublicOrderController` inside **OrderModule** (comment in file: co-located with transaction logic; OrderModule already wires KdsGateway/Webhook/Notification into OrderService) rather than modifying staff `OrderController`; staff controller left byte-identical.
3. `0741d5b` — DEFECT-B resolved via **dedicated post-transaction read** for KDS display names instead of expanding the transaction `include`, explicitly to keep the checkout HTTP response payload byte-identical (code comment in `order.service.ts`).
4. `0741d5b` — Guest branch/table binding is server-authoritative from the verified token (DOC-005 §4.6), with explicit client mismatches rejected (400).
5. `5967db9` — qr-menu converted from client-rendered mock page to **SSR** (`force-dynamic`), same-origin/tenant-Host API addressing, dev-only `/api` rewrites; pricing consolidated into a shared pure `lib/pricing.ts`.
6. `5967db9` — Guest payment method fixed to `CASH` (pay-at-counter) as the only universally valid enum value without a guest payment integration; order lands `PENDING` into the existing cashier state machine (MenuBrowser.tsx:161).
7. Pre-Sprint history (upstream): `993b801` "quality hardening — security fixes, missing tests, error handling"; `9fb9c97` ESLint zero-error CI enforcement (DOC-010 §10.2); `9ed1f2d` backup/DR; `5a5d0ac` zero-downtime migration strategy; `c75372f` k8s manifests.
8. Session-approved decision NOT yet in repository code: RS256 migration (S0-T01) deferred — recorded here for continuity (cannot be evidenced from repo history itself).
9. `c15843f` (R4, 2026-07-30) — Pre-existing broken migration repaired **in place at identifier level** (no corrective chain migration authored): approved scope was "fix the migration, preserve behaviour"; behaviour parity proven at runtime (conditional audit trigger and literal payload byte-equivalent).
10. `084dd37` (R5, 2026-07-30) — Seed IDs fixed as **deterministic UUIDs derived from the original slugs** (sha256 → v4-shape) instead of random UUIDs or dropping explicit IDs: preserves reproducible demo databases + a slug→UUID audit trail; baked literals chosen over a runtime helper because the workspace has no `@types/node` and the canonical seed runner type-checks.
11. 2026-07-30 — **Push-ownership policy:** pushes are performed personally by the user; the session never pushes and never requests credentials (§6/§16 updated to match).
12. 2026-07-30 — **Step-4 degraded-path decision:** with Docker unavailable, a native runtime (apt PostgreSQL/Redis + compiled `dist` + `next dev`) was accepted as the equivalent live-verification environment; one browser-pointer assertion was declared CANNOT VERIFY instead of being faked.
13. 2026-07-30 — **Scope discipline on defect fixes:** R4 and R5 each fixed in exactly one isolated commit with before/after verification; R1/R2/R3 deliberately left OPEN pending scoping (no drive-by fixes).

---

# 15. Outstanding Work

1. **Sprint 1 Step 5** — final gate: lint 0, all suites green, `turbo build`, final commit. Awaiting explicit approval. Known closure blockers (§21): PREX-TSC-001/002 (turbo build fails on main), PREX-E2E-001 (1 red spec cell) — both need a fix-first vs documented-exception decision. Push afterward is user-owned (§16).
2. **Open runtime-defect fix decisions (awaiting user scoping):** R2 = PREX-MIG-002 and R3 = PREX-MIG-003 (broken migrations 4/5, CONFIRMED 2026-07-30). Not started; no fixes without approval. (R1 = LATENT-KDS-001 resolved 2026-07-30 — §7.)
3. **`paymentMethod` persistence decision (surfaced by Step-4 live verification):** `CreateOrderRequestDto` accepts `paymentMethod` and the guest UI sends `CASH` (§14 decision 6), but the `Order` model has **no such column** — the response field is `null` and the value is silently dropped. Decide: add an `Order.paymentMethod` column (migration) or trim DTO/UI. Status: open decision item; **not** counted as a confirmed defect (behavior is lossless-relative-to-schema by construction, but contradicts the public contract intent).
4. Guest checkout subscription-status gating parity (currently enforced on guest reads only) — flagged for decision, not implemented (outside approved Step-2 scope).
5. Build-gate remediation (PREX-TSC-001/002): 140 api + 16 db legacy type errors breaking `pnpm build`/CI Job 3/Docker builder.
6. Auth-UI gap: no standalone login screen exists in any frontend; the only in-repo writer of `localStorage.accessToken` is the backoffice onboarding wizard (`RestaurantCreationWizard.tsx:253`), so the Cashier app has no independent login path (audit-corrected 2026-07-30).
7. Spec-drift inventory resolution (§7 list) — documentation or code alignment decisions (Sprint-3 doc baseline).
8. Invoice PDF generation (real file instead of fabricated `pdfUrl`); discount engine (`discountAmount` placeholder); FCM real provider; Socket.io Redis adapter vs multi-pod k8s HPA.
9. Dev-port mismatch resolution (LATENT-ENV-001): choose canonical local API port (8000 per `main.ts` default vs 3001 assumed by qr-menu dev defaults) and align code or env documentation.

---

# 16. Risks

| Risk | Evidence | Impact |
|---|---|---|
| Work loss: sandbox wipes local commits / `.git/config` / `node_modules` / `dist` each turn | Observed repeatedly (5+ wipe cycles by 2026-07-30); commits re-created stat-identically each time | Sprint work only safe in file contents; **push required for durability** |
| Push durability depends on user-side push (2026-07-30 policy: session never pushes, never requests credentials) | `.git/config` snapshot-excluded → `origin` re-added per session; wiped/re-created hashes logged §6 | Until the user pushes, all local commits stay at wipe risk; CI/CD (ci.yml, cd.yml) unverifiable by session |
| No Docker in sandbox (Step-4 resolved via native runtime) | session command evidence (`docker: command not found`); Step-4 completion record §19 | Retired for Sprint-1 verification on 2026-07-30 (native substitute accepted); recurs for future environment needs (any Sprint-2 e2e) |
| Broken migrations in chain (R2/R3) + blocked Prisma engines (ENV-TSK-0006) | verbatim apply errors §7; `prisma migrate deploy` unusable in sandbox | Automated provisioning path red end-to-end; psql-apply workaround documented §9 |
| Production build broken pre-existing | `tsc` exits 2 in api (140) and db (16); CI Job 3 runs `pnpm build`; Dockerfile builder runs it | Release packaging blocked until remediation |
| Recurring `packages/db/scripts/maintenance.sh` mode flip (100755→100644) after installs | observed repeatedly; restored each time (`chmod +x`), never committed | noise risk in future commits |
| Rate-limit/CSRF assumptions for guest channel depend on middleware host resolution | verified code paths | any proxy stripping `Host`/forwarding breaks tenancy at edge |
| Local dev misconfiguration | LATENT-ENV-001: qr-menu dev defaults (port 3001) vs API default (8000) — **CONFIRMED live 2026-07-30** (SSR error view on default env) | developer onboarding friction; SSR/checkout calls misroute without env alignment |

---

# 17. Next Sprint Entry Point

**Immediate next action (upon approval): Sprint 1 Step 5 — final gate.**
Gate criteria from the plan, with today's verified baselines:
1. Lint 0 — baselines already green (api eslint 0; db eslint 0 — re-verified 2026-07-30).
2. Suites green — repo-script baseline 275 pass / 2 skip / **1 pre-existing fail** (PREX-E2E-001); closure needs an explicit CTO call: fix-first vs documented accepted-baseline.
3. `turbo build` — **currently fails on main** (PREX-TSC-001/002 §21): blocking unless the build-gate remediation is scheduled first or a documented exception is approved. Never fake green.
4. Final commit; push is user-owned (§16).
Then: open-defect fix queue R1/R2/R3 (§20) and decision backlog (§23), each in isolated single commits with before/after verification (R4/R5 pattern).

**After Sprint 1:** Sprint-2 scope — **CANNOT CONFIRM** from `IMPLEMENTATION_ROADMAP.md` (no "Sprint 2" string present in that document); direction is set by the user. Queued inputs: §15 list, SPEC-DRIFT doc baseline, LATENT-ENV-001 port decision.

---

# 18. AI Bootstrap

## CONTINUE_PROJECT_PROMPT

You are continuing the Zayjar Restaurant SaaS platform mid-Sprint-1. Read this before touching anything:

**Repo & flow.** Monorepo at `/home/user/zayjar-specification` (clone of `https://github.com/amarspk/zayjar-specification`, upstream `main` = `df51f37`). Work proceeds in user-gated steps: implement ONE step → verify (tests+lint+tsc) → report → ONE local commit → STOP for approval. Never push (no remote configured: `.git/config` is snapshot-excluded; no credentials). Never create placeholder/mock/fake anything. Fix pre-existing TS errors ONLY on lines you already modify for the step.

**Sprint-1 local commits (may be wiped by sandbox — re-create from intact working tree, identical scopes/messages/stats):**
1. `feat(menu): public QR guest read API per DOC-001 1.2 / DOC-005 4.6 (Sprint 1, Step 1)` — 4 files: `apps/api/src/menu/{menu.module.ts,public-menu.service.ts,public-menu.controller.ts,public-menu.controller.spec.ts}` (629+/2−).
2. `feat(order): guest QR checkout, variant absolute pricing, KDS ticket names per DOC-005 4.3/4.6 (Sprint 1, Step 2)` — 8 files: order module (service/dto/module/new `public-order.controller.ts`), `packages/db/src/repositories/TenantTableRepository.ts` (`findByQrCodeToken`), 3 spec files incl. `kds/kds.gateway.integration.spec.ts` (710+/24−).
3. `feat(qr-menu): SSR guest ordering … (Sprint 1, Step 3)` — 10 files: `apps/qr-menu` page.tsx SSR, MenuBrowser cart + spec, new `src/app/lib/*` (4 source + 2 specs), `next.config.mjs` (1157+/269−).

**Sandbox survival playbook (all verified, do not skip):**
- pnpm is NOT on PATH: use `npx -y pnpm@10 …` (10.34.5). Never trust a plain `npx tsc` when `node_modules` is missing — it fetches a FAKE `tsc` package; after install use `./node_modules/.bin/tsc` inside each package.
- Each turn re-check: `git log` (re-create commits if wiped), `chmod +x packages/db/scripts/maintenance.sh` (mode flip recurs; keep out of commits), `git config user.name "Sprint Agent"` / `user.email "agent@zayjar.local"`.
- After `pnpm install --frozen-lockfile` rebuild in order: `packages/types`: `./node_modules/.bin/tsc`; `packages/db`: `./node_modules/.bin/tsc` (**expect exactly 16 pre-existing errors**, dist still emitted) then `node scripts/copy-generated-client.js`; api tests resolve `@zayjar/db` from `packages/db/dist` — suites fail at load until it exists.
- argon2: shipped prebuild segfaults (glibc 2.41 — reproduced live 2026-07-30); rebuild native binding: `cd node_modules/.pnpm/argon2@0.45.0/node_modules/argon2 && /usr/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js rebuild`, verify `node -e "require('./').hash('t').then(()=>console.log('ok'))"`. Only needed for suites touching auth (order/menu/kds/qrmenu specs mock argon2).
- No Docker: runtime e2e impossible in-sandbox; mark live assertions CANNOT CONFIRM.

**Verification commands & green baselines (re-verified live 2026-07-30):**
- `cd apps/api && npx jest src/order|src/menu|src/kds --config jest.config.js` → 50/23/41 tests pass.
- Full api `npx jest --config jest.config.js` → 478 pass / 2 skip / **1 fail expected** in `src/common/e2e.spec.ts` (pre-existing Fail-Safe onboarding failure — never "fix" it silently; documented).
- `pnpm --filter @zayjar/api test` collects fewer suites (278 tests) due to the repo script's shell glob depth — explain, don't panic.
- `npx eslint "src/**/*.ts"` in apps/api → 0 errors. `npx tsc --noEmit` in apps/api → **140 errors, ALL pre-existing legacy** (149 pre-Sprint; −4 Step 2; −5 R1 fix 2026-07-30; any new error = you introduced it: stop). `packages/db` tsc → 16.
- qr-menu: `pnpm --filter @zayjar/qr-menu test` → 28/28; `pnpm --filter @zayjar/qr-menu build` → PASS with `/` shown as `ƒ (Dynamic)`.

**Architecture invariants to respect:** tenant resolution happens in `TenantContextMiddleware` from Host subdomain/Custom-domain/X-Tenant-ID and flows through `dbTenantContext` ALS + Prisma `$extends` injection (unscoped: Tenant, SubscriptionPlan, AuditLog, Notification); guest surface is `@Public()` (+CsrfGuard auto-bypass) with rate tiers public 120 / checkout 30 / auth 10 per min; guest order flow: token→table (`TenantTableRepository.findByQrCodeToken`, uniform 404 anti-oracle) → branch/table server-forced → shared `createOrder` pipeline → variant absolute pricing (Condition C) → tx → post-tx name-resolution → WS `ticket.created`; qr-menu SSR addresses API via incoming Host (prod same-origin; dev `API_INTERNAL_URL` incl. tenant subdomain — dev default port assumption 3001 vs API default 8000: LATENT-ENV-001); API listens on `PORT || 8000` (`main.ts:71`), compose publishes `${PORT:-8000}:8000`.

**Open questions awaiting user decision (do not resolve unilaterally):** ~~push credentials~~ → resolved 2026-07-30 by policy (user pushes personally; session never pushes, §6/§16); Sprint-1 Step-5 approval + its gate-blocker treatment (§21); RS256 deferral; guest-checkout subscription-gating parity; R2/R3 broken-migration fix scope (§20); `paymentMethod` persistence decision (§15 item 3); build-gate remediation ownership (140+16 legacy tsc errors make `pnpm build`/CI-Job-3/Docker fail on main); dev-port alignment (LATENT-ENV-001, CONFIRMED).

Documents of record: this file, plus `DOC-001.md…DOC-010.md`, `SPEC_INDEX.md`, `IMPLEMENTATION_ROADMAP.md`, `TSK-0006_HEALTH_CHECK.md` at repo root.

---

# 19. Verification History

Every verification executed to date. Commit hashes are **local, pre-push** (pushes are user-owned, §16); sandbox wipes of local hashes are documented in §6 — contents and stats are the durable identity.

| # | Date | Sprint | Step | Verification Result | Commit Hash | CTO Decision |
|---|---|---|---|---|---|---|
| 1 | 2026-07-30 | Sprint 1 | Step 1 — public guest read API | ✅ VERIFIED (menu suites 23/23; eslint 0; tsc Δ0 against 149 pre-existing; contracts §8.1/§8.2) | `d1c6035` | APPROVED → proceed Step 2 |
| 2 | 2026-07-30 | Sprint 1 | Step 2 — guest checkout + DEFECT-A/B | ✅ VERIFIED (order 50/50, menu 23/23, kds 41/41, full api 478 pass / 2 skip / 1 pre-existing fail; tsc 149→145 with 0 added) | `0741d5b` | APPROVED → proceed Step 3 |
| 3 | 2026-07-30 | Sprint 1 | Step 3 — qr-menu SSR/cart/checkout | ✅ VERIFIED (build PASS with `ƒ /` Dynamic; qr-menu 28/28 in 3 suites; zero mocks grep-clean; api regression green; independently re-verified same date after session compaction) | `5967db9` | APPROVED → proceed Step 4 |
| 4 | 2026-07-30 | Sprint 1 | Step 4 — live end-to-end verification (native runtime, no repo changes) | ✅ VERIFIED channel end-to-end: menu/table GETs 200 (Decimal→Number, branding #0B5FFF); uniform anti-oracle 404 (incl. soft-deleted token); 403 no-tenant; gating UNPAID/CANCELED→403, PAST_DUE→200, ACTIVE→200; 4× checkout HTTP 201 with server totals 42.55 / 5.75 / 11.50 / 16.67 (last via qr-menu rewrite proxy = browser path); `tableId` server-forced; `kitchen_queues` rows created; WS `/kds` `ticket.created` with real item names; SSR branding + table/branch + error views. **1 item ⚠️ CANNOT VERIFY:** pointer-level cart clicks (no browser automation in sandbox) — equivalently covered through the Next.js rewrite-proxy order. Red pre-existing findings: R1 CONFIRMED, R2/R3/R5 CONFIRMED red, R4 trigger catastrophe CONFIRMED; LATENT-ENV-001 CONFIRMED; LATENT-MEDIA-001 runtime fear DISPROVEN | none (verification-only; zero repository changes) | APPROVED; separate fix approvals issued for R4 and R5 only; R1–R3 left open for scoping |
| 5 | 2026-07-30 | Post-Step-4 | Runtime Defect R4 fix (PREX-MIG-001) | ✅ VERIFIED: migration applies clean; 8/8 triggered tables accept UPDATEs with `updatedAt` trigger override (backdate probe); non-status order UPDATE writes 0 audit rows; DRAFT→PENDING (psql) and PENDING→ACCEPTED (API `PUT` → HTTP 200) each wrote exactly 1 correct `STATUS_CHANGE` audit row; api suite 275 pass / 2 skip / 1 pre-existing fail = baseline (no regression) | `c15843f` | APPROVED commit |
| 6 | 2026-07-30 | Post-Step-4 | Runtime Defect R5 fix (PREX-SEED-001) | ✅ VERIFIED: canonical `pnpm prisma:seed` completes on fresh PostgreSQL 17.10 DB, twice consecutively (FK-cascade cleanup); demo tenant/restaurant/products/categories/QR tokens SQL-verified; db lint 0, db tsc 16, api suite 275/2/1 = baselines (no regression) | `084dd37` | APPROVED commit |
| 7 | 2026-07-30 | Post-Step-4 | Runtime Defect R1 fix (LATENT-KDS-001) — investigate + minimal fix mandate | ✅ VERIFIED after 3-stage proof: (a) static — same line was tsc TS2353 at `kds.service.ts(76,20)` + 4 knock-on collapses; (b) type system after one-line fix `orderBy: { order: { createdAt: 'asc' } }` — kds module 6→1 errors, api total 145→140, 0 added (remaining kds error `kds.controller.ts:46` pre-existing on untouched line, deliberately not fixed); (c) live on fresh DB `zayjar_r1` — `GET /api/v1/kds/tickets` → HTTP 200 (pre-fix 500), oldest-order-first ASC despite newest-first inserts, COMPLETED-order ticket excluded (filter intact), hydration/elapsed/RUSH-escalation/404-path intact, zero `Unknown argument` in API log. Suites: kds 41/41, full api 275 pass / 2 skip / 1 pre-existing fail = baselines. Severity classified **Major** (confirmed production-facing 500 on staff endpoint; not Critical — read-only, WS push path unaffected, no gate criterion hit). Blocking analysis: did NOT block the Sprint-1 Step-5 gate criteria (suites/build/guest channel unaffected), resolved by elimination | — (single commit carrying this record; local, pre-push per §6 lineage rule) | APPROVED commit (minimal one-line fix authorized by mandate) |

Anything not listed in this table is not verified.

**Repository Corrections applied in the 2026-07-30 documentation pass** (document-vs-repository contradictions fixed in place; repository wins):
1. §9 migration applied-state was "UNKNOWN (no runtime)" → M1/M2/M3/M6 verified clean-applying (two independent live DBs); M4/M5 verified FAILING — recorded.
2. R2 (`orders_partitioning_by_year`) and R3 (`add_search_indexes`) were absent from the defect inventory → added to §7 and §20 (both CONFIRMED red 2026-07-30).
3. LATENT-KDS-001 was "CANNOT CONFIRM" → CONFIRMED at runtime (HTTP 500 + verbatim API log).
4. LATENT-MEDIA-001 carried a runtime-ReferenceError claim → DISPROVEN (bare emitted declaration); downgraded to compile-time debt.
5. LATENT-ENV-001 was "runtime impact CANNOT CONFIRM" → CONFIRMED (default-env SSR error view; `API_INTERNAL_URL` override green).
6. §6/§16 said push "blocked: no remote/credentials" → superseded by the 2026-07-30 user-owned push policy.
7. §15/§17 carried Step-4-pending content → Step 4 marked complete; Step 5 gated on approval; Sprint-2 scope marked CANNOT CONFIRM (roadmap contains no "Sprint 2").
8. §18 open-question "push credentials" → resolved by the same push policy (correction 6).

---

# 20. Open Blocking Defects

All remaining **verified** open defects — none invented; IDs match §7. "Blocking Which Step" names the earliest affected gate.

| ID | Description (verified) | Current Status | Priority | Blocking Which Step |
|---|---|---|---|---|
| PREX-TSC-001 | 140 api tsc errors; `tsc` is the api build script | OPEN | Critical | Sprint 1 Step 5 (`turbo build` criterion); also CI Job 3 and the Docker builder |
| PREX-TSC-002 | 16 db tsc errors (dist still emitted) | OPEN | Major | Sprint 1 Step 5 (turbo build includes the db build) |
| PREX-E2E-001 | `src/common/e2e.spec.ts` onboarding test fails (Fail-Safe 'User') | OPEN | Major | Sprint 1 Step 5 ("suites green" criterion needs a CTO call); CI Job 2 |
| PREX-MIG-002 (R2) | orders-partitioning migration fails on apply (broken `created_at` partition key) | OPEN — CONFIRMED 2026-07-30 | High | clean DB provisioning / `prisma migrate deploy`; any migration-chain work |
| PREX-MIG-003 (R3) | search-index migration fails at line 14 (`tenant_id`); partial-apply drift (`products.tsv_menu_search`) | OPEN — CONFIRMED 2026-07-30 | High | clean DB provisioning / `prisma migrate deploy` |
| ENV-TSK-0006 | install scripts blocked (prisma engines, argon2, sharp); CLI migrate path unusable in sandbox | OPEN | High | clean CI install / provisioning without the documented workarounds (§18) |
| LATENT-SUB-001 | unguarded `plan` dereference `subscription.service.ts:114–116` (+ second site `:102`) | OPEN (data-dependent; trigger unobserved) | Low | none currently |
| LATENT-MEDIA-001 | TS2552 `urls` at `media.service.ts:112` | OPEN — compile-time only (runtime disproven 2026-07-30) | Low | folded into PREX-TSC-001 |
| LATENT-ENV-001 | qr-menu dev defaults assume API port 3001 vs actual default 8000 | OPEN — CONFIRMED 2026-07-30 | Medium | local developer DX only (not the CI/gate) |
| SPEC-DRIFT | documentation drift inventory (§7 row) | OPEN | Low | Sprint-3 documentation baseline |

---

# 21. Quality Gate

- **Current Sprint:** Sprint 1 — public QR ordering channel end-to-end.
- **Current Step:** Step 5 — final gate (lint 0, suites green, `turbo build`, final commit). **Status: NOT STARTED.** (Step 4 is closed — VERIFIED 2026-07-30, §19 row 4.)
- **Critical Defects: 1** — PREX-TSC-001.
- **Major Defects: 5** — PREX-TSC-002, PREX-E2E-001, PREX-MIG-002 (R2), PREX-MIG-003 (R3), ENV-TSK-0006. (Formerly also 1 High-severity confirmed runtime defect — **R1/LATENT-KDS-001: FIXED+VERIFIED 2026-07-30**, §19 row 7.)
- **Minor Defects: 4** — LATENT-SUB-001, LATENT-MEDIA-001 (compile-time only), LATENT-ENV-001, SPEC-DRIFT.
- **Can Current Step Be Closed? NO.**
- **Reason (verified evidence only):** (1) CTO Rule 5 — a step cannot close before its verification has run, and Step 5 has not been executed; (2) the `turbo build` criterion fails on main today (PREX-TSC-001: api `tsc` exits 2 with 140 errors; PREX-TSC-002: db `tsc` 16 errors — both re-verified 2026-07-30); (3) the "suites green" criterion currently contains 1 red cell (PREX-E2E-001) unless the CTO explicitly accepts it as documented baseline.

---

# 22. Technical Debt

Quantified, verified debt — nothing speculative:

- **Type errors:** api **140** (per-module breakdown in §7 PREX-TSC-001; 149 pre-Sprint; −4 Step-2 lines; −5 R1-fix line + knock-ons 2026-07-30; Sprint 1 added 0) + db **16** (BaseTenantRepository delegate types vs generated client emissions). Together they break the production build chain (`pnpm build`, CI Job 3, Docker builder).
- **Tests:** 1 failing spec (PREX-E2E-001, pre-existing, documented); 2 skipped cells from DB-gated conditional describes (verified site `media-concurrency.integration.spec.ts:33`; finer itemization CANNOT CONFIRM from aggregate output).
- **Install/runtime workarounds (ENV-TSK-0006):** argon2 node-gyp rebuild after every install; Prisma CLI engines absent (migrations applied via psql; seed via canonical pnpm script); sharp blocked. Recipes in §18.
- **Placeholders/stubs (documented, approved out-of-scope):** invoice `pdfUrl` fabricated (`order.service.ts:451`); `discountAmount = 0.00` placeholder (line 232 comment); FCM log-only stub (no `firebase-admin` dep); Socket.io Redis adapter absent while `k8s/api/hpa.yml` scales 2–10 pods (SPEC-DRIFT).
- **Data-layer chain:** R2/R3 migrations fail on apply → the chain cannot be applied by `prisma migrate deploy` anywhere until they are fixed AND engines are resolvable; M6 fixed (R4 `c15843f`); seed repaired (R5 `084dd37`).
- **Process friction:** `packages/db/scripts/maintenance.sh` exec-bit flip recurs after installs (never committed); local-commit re-creation ritual each session until the user pushes (§6).
- **Documentation drift:** SPEC-DRIFT inventory (§7) — README table count/clone URL, KDS room naming, HS256-vs-RS256 (decision-deferred), DOC-003 route coverage, etc.

---

# 23. TODO

Ordered actionable backlog (**user** = decision/approval/push; **agent** = execution after approval):

1. [user] Approve and scope Sprint 1 Step 5; decide treatment of PREX-TSC-001/002 and PREX-E2E-001 against gate criteria (fix-first vs documented exception, §21).
2. [user] Fix-scope decisions: PREX-MIG-002 (R2), PREX-MIG-003 (R3) — same identifier-disease family as R4 (fixed); no drive-by fixes allowed. (R1/LATENT-KDS-001 resolved 2026-07-30 — §19 row 7.)
3. [user] `paymentMethod` persistence decision (§15 item 3): add `Order.paymentMethod` column or trim DTO/UI.
4. [user] RS256 migration timing (deferred S0-T01; no code change made).
5. [user] Guest-checkout subscription-gating parity (currently enforced on guest reads only).
6. [user] Build-gate remediation ownership (140 + 16 legacy tsc errors).
7. [user] Canonical local API port decision (LATENT-ENV-001): 8000 vs 3001.
8. [user] **Push** local commits `d1c6035` … (through the R1 fix commit) to `origin` (user-owned; the session has pushed nothing, ever).
9. [agent] After approvals: execute approved fixes in isolated single commits with before/after verification (the R4/R5 pattern).
10. [user] Define Sprint-2 scope (CANNOT CONFIRM from `IMPLEMENTATION_ROADMAP.md` — see §17).

---

# 24. End of Session Procedure

Every future session MUST end with all of the following, in order:

1. Update PROJECT_STATE.md.
2. Update Sprint.
3. Update Step.
4. Update Verification History (§19).
5. Update Risks (§16).
6. Update Technical Debt (§22).
7. Update TODO (§23).
8. Update Open Blocking Defects (§20).
9. Update Quality Gate (§21).
10. Commit.
11. Push if GitHub is available.

If GitHub is unavailable — or pushing is not the session's to perform (§16 policy) — state clearly:

**"Push not performed."**

Never claim that push happened without verification (verifiable push output or remote ref match required).

---

# 25. Session Recovery

How any new AI (or human) continues this project using ONLY this document, the repository, and commit history:

1. **Locate:** repository `/home/user/zayjar-specification`; canonical doc = repo-root `PROJECT_STATE.md` (mirror `~/PROJECT_STATE.md`, byte-synced at every doc commit — verify with `sha256sum`).
2. **Read in this order:** §6 (current position) → §19 (what is proven) → §20/§21 (what blocks) → §7 (defect detail) → §15/§23 (what's next) → §16/§22 (risk and debt) → §14 (decisions) → §18 (toolchain survival playbook) → §13 (green baselines and exact commands).
3. **Verify before believing:** `git log --oneline`; compare the HEAD chain against the hashes recorded in §5/§19. If sprint or fix commits are missing (sandbox wipes local commits, §6): re-create them from the intact working tree using the messages and stats recorded in §5/§19 — file contents, not commit objects, are the durable identity until the user pushes.
4. **Re-establish the toolchain per §18:** pnpm via `npx -y pnpm@10`; per-package `./node_modules/.bin/tsc` (never bare `npx tsc` — downloads a fake package); argon2 node-gyp rebuild; build order `packages/types` → `packages/db` (expect exactly 16 errors) → `node scripts/copy-generated-client.js`.
5. **Run the §13 baseline commands and match the recorded numbers before any modification.** Any baseline deviation means *you* introduced it — stop and revert.
6. **Runtime work** follows the native-runtime recipe (PostgreSQL/Redis via apt, migrations applied via psql, fixture `/home/user/e2e/fixture.sql` with its documented corrections; Step-4 evidence under `/home/user/e2e/`).
7. **Proceed only within user-gated steps** (§26 CTO Rules; §23 TODO ordering). If any claim in this document cannot be reproduced from the repository, treat the repository as truth and record the correction (§19 footer pattern).

---

# 26. CTO Rules

Permanent. They apply to every contributor, human or AI, without exception:

1. Never guess.
2. If something cannot be verified, write **CANNOT CONFIRM**.
3. Never change architecture without documenting it (record in §14).
4. Never delete information without documented justification.
5. Never close a Step before verification.
6. Every approved decision must be recorded (§14 / §19).
7. Repository reality overrides documentation — when they conflict, fix the document to match the repository and log the correction (§19 footer).

---

# 27. Future Architecture

The following files will be created **only after MVP completion** (the formal MVP scope definition: CANNOT CONFIRM from the repository; to be declared by the user/CTO):

- `AGENTS.md`
- `JARVIS.md`
- `CTO_PLAYBOOK.md`

They are intentionally NOT created now. Until then, this PROJECT_STATE.md remains the single source of truth.

---

# 28. Session Completion Policy

**Permanent rule — no future session may be considered complete until:**

- PROJECT_STATE.md is updated (per the §24 procedure, items 1–9), AND
- a Commit is created, AND
- a Push is performed if available — otherwise an explicit "**Push not performed.**" statement (§24 / §16).
