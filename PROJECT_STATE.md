# PROJECT STATE — Zayjar Restaurant SaaS Platform

> Canonical engineering state document.
> Generation date: 2026-07-29 (Asia/Dubai). Independent audit corrections applied 2026-07-30 (full repository verification + live re-run of every test/type/build count).
> Rule applied: every statement below is verified against the repository (file paths cited). Anything not verifiable from the repository is marked **UNKNOWN**. Nothing is speculative.

---

# 1. Project Overview

## 1.1 Project goal

Multi-tenant Restaurant SaaS platform. Verified scope identifiers from `DOC-001.md` and code comments: tenants (restaurant brands) with staff apps (Backoffice admin, Cashier POS), guest QR ordering channel (scan table QR → browse menu → checkout without account), Kitchen Display System (KDS) with realtime ticket events, and Stripe-based subscription billing with plan limits.

## 1.2 Current platform scope

- Monorepo (pnpm workspaces + Turbo), root `package.json`, `turbo.json`.
- Specification documents verified present at repo root: `DOC-001.md` … `DOC-010.md`, `SPEC_INDEX.md`, `IMPLEMENTATION_ROADMAP.md`, `TSK-0006_HEALTH_CHECK.md`.
- In-progress execution sprint: **Sprint 1 — public QR ordering channel end-to-end** (Steps 1–3 complete; Step 4–5 pending, per `IMPLEMENTATION_ROADMAP.md`-aligned session plan recorded in commits `d1c6035`…`5967db9`).

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

Pre-Sprint-1 baseline (upstream `df51f37` "Fix restaurant setup flow" and earlier): full platform scaffolding — monorepo, all four apps, DB schema + tenant extension, auth/JWT, billing, KDS gateway, CI, k8s, docs.

---

# 6. Current Sprint Status

**Sprint 1 — "Public QR Ordering Channel fully functional end-to-end":**

| Step | Status |
|---|---|
| Step 1 — public guest read API | ✅ Complete (committed) |
| Step 2 — checkout token verification + DEFECT-A + DEFECT-B | ✅ Complete (committed) |
| Step 3 — qr-menu SSR/cart/checkout | ✅ Complete (committed) |
| Step 4 — e2e/local live verification (seeded `albaik` token flow over Docker runtime) | ⏸ Not started. **Blocked in-session: no Docker available in this sandbox** (verified). |
| Step 5 — final gate (lint 0, suites green, `turbo build`, final commit) | ⏸ Not started |

**Repository safety note (verified repeatedly — 5+ sandbox wipe cycles by 2026-07-30):** the session sandbox periodically wipes `.git/config` (including remote + identity), `node_modules`, `dist/`, and **locally created commits**; working-tree file contents survive. The three sprint commits have been deterministically re-created from file contents each time (stat-identical). Durable persistence requires a push to GitHub, which is blocked: no remote configured + no write credentials in-session.

---

# 7. Known Defects

| ID | Description | Status | Affected modules |
|---|---|---|---|
| DEFECT-A | `variantId` was stored on order items but variant price never applied (pricing used basePrice + sizeAdjustment only), violating DOC-005 §4.3 Condition C absolute override | **FIXED in Step 2** (`order.service.ts:172–180` pricing loop: variant absolute price, `stockQuantity<=0` rejection, size skipped when variant selected; unit tests `order.service.spec.ts:623/668/695` + integration P5) | order |
| DEFECT-B | Transaction `include` carried only `orderItemAddons`; WS `ticket.created` payload read `item.product?.name` → `undefined` → "Unknown Product" on live KDS tickets | **FIXED in Step 2** (post-transaction name-resolution read at `order.service.ts:291`, response payload byte-identical; tests `order.service.spec.ts:714` + `:781` + real-gateway integration) | order → kds |
| PREX-E2E-001 | `src/common/e2e.spec.ts` "E2E Verification 1: Tenant Onboarding" fails with `Fail-Safe Block: Access to model 'User' was blocked due to missing tenant context` (`packages/db/src/index.ts:34`). Proven pre-existing on pristine HEAD via stash test; reproduced in live full-suite run 2026-07-30 | OPEN (documented, not sprint scope) | common (e2e spec), db extension |
| PREX-TSC-001 | Pre-existing TypeScript debt in `apps/api`: **145 errors** as of Step-2 completion (149 at Sprint-1 start; 4 removed on Step-2-touched lines; 0 introduced by Sprint 1 — re-verified 2026-07-30). `tsc` is the api `build` script → **production build (`pnpm build`) and CI Job 3 "Build Verification" fail on main** (verified: build script `tsc`, tsconfig includes `src/**/*`, CI runs `pnpm build`; Dockerfile api builder runs `pnpm run build`) | OPEN (legacy; remediation belongs to a dedicated build-gate task) | api-wide; per-module counts (fresh `tsc --noEmit`, 2026-07-30): media 24, billing 23, order 15, audit 15, common 15, auth 10, subscription 8, tenant 7, notification 7, kds 6, device-token 6, worker 4 (`src/worker.ts`), payment 2, webhook/asset/admin 1 each — sums to exactly 145 |
| PREX-TSC-002 | `packages/db` tsc: **16 pre-existing errors** (`BaseTenantRepository` delegate type vs generated-client `Exact<>` types; dist still emitted) — re-verified 2026-07-30 | OPEN (legacy) | db |
| PREX-MIG-001 (Runtime Defect R4) | Migration `20260726100001_add_lifecycle_triggers` wrote triggers against snake_case columns that exist nowhere in the schema: `update_updated_at()` set `NEW."updated_at"` (real: `"updatedAt"` on all 8 models, no `@map`) → **every UPDATE failed on all 8 triggered tables** (tenants, users, branches, products, orders, customers, subscriptions, media): psql `record "new" has no field "updated_at"`; API `PUT /api/v1/orders/:id/status` → HTTP 500 (entire order state machine dead at runtime). Same disease in `log_order_status_change()`: insert into `audit_logs` used `tenant_id/user_id/entity_name/entity_id/old_values/new_values/ip_address/user_agent/created_at` (real: camelCase per `schema.prisma` AuditLog) + read `NEW."tenant_id"` | **FIXED 2026-07-30** — identifier-only rewrite (function/trigger names, BEFORE/AFTER timing, 8-table set, `IS DISTINCT FROM` guard, literal values `'STATUS_CHANGE'/'Order'/NULL/'system'/'database-trigger'`, webhooks exclusion all preserved). Live-verified on PostgreSQL 17.10 verification DB: all 8 tables accept UPDATEs with trigger overriding `updatedAt` (backdate probe → ~now()); non-status order UPDATE writes zero audit rows; status changes DRAFT→PENDING (psql) and PENDING→ACCEPTED (API `PUT` → HTTP 200) each wrote exactly one correct `STATUS_CHANGE` audit row; app-level audit row also logged; full api suite re-run = 275 pass / 2 skipped / 1 pre-existing fail (byte-identical baseline → no regression) | db (migrations), api (all UPDATE paths) |
| LATENT-KDS-001 | `kds.service.ts:76` `orderBy: { createdAt: 'asc' }` on `KitchenQueue`, a model with **no `createdAt` column** (schema verified) → likely Prisma runtime `ArgumentValidationError` on KDS REST ticket list. **CANNOT CONFIRM at runtime** (no DB/Docker in sandbox) | OPEN — high-probability suspect; decision deferred by user for Step-4 verification | kds |
| LATENT-MEDIA-001 | `media.service.ts:112` TS2552 `Cannot find name 'urls'` → potential ReferenceError if that branch executes | OPEN (unverified, out of sprint scope) | media |
| LATENT-TEN-001 | ~~`tenant.service.ts` reads `.branding` from a `SubscriptionPlan`-shaped object~~ — **AUDIT-VERIFIED NON-ISSUE (2026-07-30):** every `.branding` access in `tenant.service.ts` targets the `Tenant` model, which owns the column (`schema.prisma:99`): `:236` (`prismaRead.tenant.findUnique` result), `:304` / `:313` (`prisma.tenant.*` results, lines 295–305 are DTO-side by design). `SubscriptionPlan` indeed has no `branding` (verified, 0 occurrences), and no code ever reads it | **CLOSED — not a defect** (former suspicion disproven by audit) | tenant |
| LATENT-SUB-001 | `subscription.service.ts:114–116` dereferences `subscription.plan` after `as … \| undefined` cast without guard (`!plan.allowCustomDomains` at :116) → TypeError if plan missing at runtime; second unguarded site `:102` (`plan.name` after cast at :86); correctly guarded counterpart exists at :61 | OPEN (data-dependent) | subscription |
| LATENT-ENV-001 | Dev-port mismatch: qr-menu dev defaults assume the API on **port 3001** (`apps/qr-menu/src/app/lib/guest-api.ts:111–123`; `next.config.mjs` rewrite default `http://localhost:3001`), while the API listens on `PORT \|\| 8000` (`apps/api/src/main.ts:71`) and docker-compose maps `${PORT:-8000}:8000` → local dev outside compose without `PORT`/`API_INTERNAL_URL` set misroutes SSR fetches and the browser `/api` rewrite proxy | OPEN (configuration; runtime impact CANNOT CONFIRM in sandbox) | qr-menu ↔ api |
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
- **Migrations:** baseline committed at `packages/db/prisma/migrations/` (6 migrations + `migration_lock.toml`: `20250101000000_init`, `20260725000000_add_media_model`, `20260726000000_add_tenant_branding_jsonb`, `20260726000001_orders_partitioning_by_year`, `20260726100000_add_search_indexes`, `20260726100001_add_lifecycle_triggers`). **Applied state of any live database: UNKNOWN** (no runtime DB available in sandbox). Seed script exists (`prisma/seed.ts`) with demo tenant `albaik`. **Update 2026-07-30:** `20260726100001_add_lifecycle_triggers` corrected and live-verified (PREX-MIG-001 / R4 above): applies clean and executes correctly on PostgreSQL 17.10 (all 9 triggers live: 8× `set_updated_at` BEFORE UPDATE + `log_status_change` AFTER UPDATE on `orders`). Verified via session verification DB `zayjar_r4` (M1/M2/M3 + corrected M6 applied by psql; M4/M5 excluded from that session's scope); production/provisioned-DB applied state otherwise remains as stated.
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
| tsc `apps/api --noEmit` | 145 errors, exit 2 (all pre-existing legacy; 0 from Sprint 1 — byte-diff proven) | `cd apps/api && npx tsc --noEmit` |
| tsc `packages/db` | 16 errors (pre-existing; emits dist regardless) | `cd packages/db && npx tsc` |
| CI status on main (remote) | UNKNOWN (no access to Actions history); by construction Job 3 (`pnpm build`) fails on PREX-TSC-001/002 | — |

**Notes:** (1) CI Job 2 executes **root** `pnpm test` → root `jest.config.js` (`testMatch: '**/*.spec.ts'`, node environment, `tests/e2e/` ignored), which collects a different set than the per-package commands above. (2) The CI row covers both `.github/workflows/ci.yml` and `cd.yml` — neither is verifiable by us (no GitHub access).

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

---

# 15. Outstanding Work

1. **Sprint 1 Step 4** — live end-to-end verification: seed `albaik` tenant, obtain real `qrCodeToken`, exercise browser→nginx→API→DB flow incl. KDS ticket appearance; requires Docker runtime (unavailable in current sandbox). Includes runtime-confirming LATENT-KDS-001 (decide scope of `kds.service.ts:76` fix).
2. **Sprint 1 Step 5** — final gate: lint 0, all suites green, `turbo build`, final commit; then push (blocked on credentials — §16).
3. Guest checkout subscription-status gating parity (currently enforced on guest reads only) — flagged for decision, not implemented (outside approved Step-2 scope).
4. Build-gate remediation (PREX-TSC-001/002): 145 api + 16 db legacy type errors breaking `pnpm build`/CI Job 3/Docker builder.
5. Auth-UI gap: no standalone login screen exists in any frontend; the only in-repo writer of `localStorage.accessToken` is the backoffice onboarding wizard (`RestaurantCreationWizard.tsx:253`), so the Cashier app has no independent login path (audit-corrected 2026-07-30).
6. Spec-drift inventory resolution (§7 list) — documentation or code alignment decisions (Sprint-3 doc baseline).
7. Invoice PDF generation (real file instead of fabricated `pdfUrl`); discount engine (`discountAmount` placeholder); FCM real provider; Socket.io Redis adapter vs multi-pod k8s HPA.
8. Dev-port mismatch resolution (LATENT-ENV-001): choose canonical local API port (8000 per `main.ts` default vs 3001 assumed by qr-menu dev defaults) and align code or env documentation.

---

# 16. Risks

| Risk | Evidence | Impact |
|---|---|---|
| Work loss: sandbox wipes local commits / `.git/config` / `node_modules` / `dist` each turn | Observed repeatedly (5+ wipe cycles by 2026-07-30); commits re-created stat-identically each time | Sprint work only safe in file contents; **push required for durability** |
| No GitHub remote configured + no write credentials | `git remote -v` empty (`.git/config` wiped); no token/SSH provided | Cannot protect work remotely; CI/CD (ci.yml, cd.yml) unverified by us |
| No Docker/runtime in sandbox | session command evidence (`docker: command not found`) | Step-4 live e2e unverified; latent runtime suspects (LATENT-*) unconfirmed |
| Production build broken pre-existing | `tsc` exits 2 in api (145) and db (16); CI Job 3 runs `pnpm build`; Dockerfile builder runs it | Release packaging blocked until remediation |
| Recurring `packages/db/scripts/maintenance.sh` mode flip (100755→100644) after installs | observed repeatedly; restored each time (`chmod +x`), never committed | noise risk in future commits |
| Rate-limit/CSRF assumptions for guest channel depend on middleware host resolution | verified code paths | any proxy stripping `Host`/forwarding breaks tenancy at edge |
| Local dev misconfiguration | LATENT-ENV-001: qr-menu dev defaults (port 3001) vs API default (8000) | developer onboarding friction; SSR/checkout calls misroute without env alignment |

---

# 17. Next Sprint Entry Point

**Immediate next action (upon approval): Sprint 1 Step 4 — live e2e verification.**
Prerequisites: Docker or any runtime providing Postgres+Redis+API+qr-menu (per `docker-compose.yml` — API publishes `${PORT:-8000}:8000`; note **LATENT-ENV-001**: qr-menu dev-side API addressing defaults to port 3001, so outside compose set `API_INTERNAL_URL`/`PORT` coherently), run `packages/db` seed, fetch a real `qrCodeToken` from seeded `albaik` tables, then verify:
1. `GET /api/v1/public/menu?token=…` through nginx/host-subdomain path.
2. SSR page render at `http://albaik.localhost:3000/?t=<token>` to real cart → `POST /api/v1/public/orders/checkout` → 201.
3. KDS `ticket.created` shows product/size/addon names; KDS REST hydration (verify LATENT-KDS-001).
4. Totals/tax match backend computation (DOC-005 §4.3).
If runtime remains unavailable: degrade honestly to the strongest possible in-sandbox e2e and record precisely which assertions stay **CANNOT CONFIRM**.
Then Step 5 (final gate) and, credentials permitting, `git remote add origin https://github.com/amarspk/zayjar-specification.git && git push -u origin main`.

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
- `npx eslint "src/**/*.ts"` in apps/api → 0 errors. `npx tsc --noEmit` in apps/api → **145 errors, ALL pre-existing legacy** (was 149 pre-Sprint; any new error = you introduced it: stop). `packages/db` tsc → 16.
- qr-menu: `pnpm --filter @zayjar/qr-menu test` → 28/28; `pnpm --filter @zayjar/qr-menu build` → PASS with `/` shown as `ƒ (Dynamic)`.

**Architecture invariants to respect:** tenant resolution happens in `TenantContextMiddleware` from Host subdomain/Custom-domain/X-Tenant-ID and flows through `dbTenantContext` ALS + Prisma `$extends` injection (unscoped: Tenant, SubscriptionPlan, AuditLog, Notification); guest surface is `@Public()` (+CsrfGuard auto-bypass) with rate tiers public 120 / checkout 30 / auth 10 per min; guest order flow: token→table (`TenantTableRepository.findByQrCodeToken`, uniform 404 anti-oracle) → branch/table server-forced → shared `createOrder` pipeline → variant absolute pricing (Condition C) → tx → post-tx name-resolution → WS `ticket.created`; qr-menu SSR addresses API via incoming Host (prod same-origin; dev `API_INTERNAL_URL` incl. tenant subdomain — dev default port assumption 3001 vs API default 8000: LATENT-ENV-001); API listens on `PORT || 8000` (`main.ts:71`), compose publishes `${PORT:-8000}:8000`.

**Open questions awaiting user decision (do not resolve unilaterally):** push credentials; RS256 deferral; guest-checkout subscription-gating parity; `kds.service.ts:76` `orderBy createdAt` latent runtime defect (KitchenQueue has no `createdAt` column); build-gate remediation ownership (145+16 legacy tsc errors make `pnpm build`/CI-Job-3/Docker fail on main); dev-port alignment (LATENT-ENV-001).

Documents of record: this file, plus `DOC-001.md…DOC-010.md`, `SPEC_INDEX.md`, `IMPLEMENTATION_ROADMAP.md`, `TSK-0006_HEALTH_CHECK.md` at repo root.
