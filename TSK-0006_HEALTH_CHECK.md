# TSK-0006 — Repository Health Check Report

**Date:** 2026-07-24
**Commit:** `23e63a8` (origin/main)
**Branch:** `main`
**Checked by:** opencode (Senior Staff Software Engineer)

---

## 1. Executive Summary

The Zayjar specification repository is a well-structured monorepo with comprehensive documentation (10 DOC files), a complete Prisma schema (29 models, 8 enums), and a full NestJS + Next.js application codebase. However, **build and test pipelines are currently broken** due to a pnpm 11 `approve-builds` blocker that prevents Prisma client generation and native module compilation. Until that blocker is resolved, no unit tests will pass and the API cannot start.

### Verdict: 🔴 BLOCKED — requires interactive `pnpm approve-builds` to unblock

---

## 2. Environment

| Item | Value |
|---|---|
| Node.js | v22.23.0 |
| pnpm | 11.9.0 |
| OS | Windows (win32) |
| Git | 23e63a8 on `main` |
| Prisma (schema) | 5.22.0 (declared in package.json) |
| Prisma (installed CLI) | Not built — blocked by approve-builds |

---

## 3. Build Status

### 3.1 Package Manager Install
- **Command:** `pnpm install --frozen-lockfile`
- **Result:** ✅ 800 packages installed
- **Warning:** 7 packages skipped post-install scripts (not approved):
  - `@nestjs/core`, `@prisma/client`, `@prisma/engines`, `argon2`, `prisma`, `sharp`, `unrs-resolver`

### 3.2 Package Builds

| Package | Command | Status | Notes |
|---|---|---|---|
| `@zayjar/types` | `npx tsc` | ✅ PASS | Clean compilation |
| `@zayjar/db` | `npx tsc` | ✅ PASS | Compiles, but `generated-client/` is missing at runtime |
| `@zayjar/api` | `npx tsc` | ⚠️ 5 ERRORS | All in `tenant-context.integration.spec.ts` — missing `PrismaClient` export + implicit `any` types |
| `@zayjar/qr-menu` | Next.js build | ⏭️ NOT TESTED | Blocked by downstream dependencies |
| `@zayjar/backoffice` | Next.js build | ⏭️ NOT TESTED | Blocked by downstream dependencies |
| `@zayjar/cashier` | Next.js build | ⏭️ NOT TESTED | Blocked by downstream dependencies |

### 3.3 TypeScript Errors (apps/api)

```
src/common/middleware/tenant-context.integration.spec.ts
  - Cannot find name 'PrismaClient' (lines referencing ungenerated client)
  - Parameter implicitly has 'any' type (multiple lines)
```

**Root cause:** `packages/db/src/index.ts` imports from `./generated-client` which doesn't exist because `prisma generate` was never run.

---

## 4. Lint Status

### 4.1 ESLint (apps/api)

| Metric | Count |
|---|---|
| **Total lines** | 775 |
| **Errors** | 557 |
| **Warnings** | 139 |

**Top error categories:**
- `@typescript-eslint/no-explicit-any` — pervasive across all service/spec files
- `@typescript-eslint/explicit-function-return-type` — widespread
- `import/no-duplicates` — some duplicate imports
- Various NestJS-specific lint rule violations

### 4.2 Next.js Lint (frontends)

| App | Status | Notes |
|---|---|---|
| `@zayjar/qr-menu` | ⏱️ TIMEOUT | `next lint` CLI hangs (attempts dev server start in CI mode) |
| `@zayjar/backoffice` | ⏱️ TIMEOUT | Same issue |
| `@zayjar/cashier` | ⏱️ TIMEOUT | Same issue |

> **Note:** Next.js CLI in non-TTY environments (like CI/tool sessions) may enter an interactive mode that never exits. Would need `--no-cache` or explicit lint config to bypass.

---

## 5. Test Status

### 5.1 Jest Unit/Integration Tests (apps/api)

**Command:** `npx jest --runInBand --forceExit`

| Result | Count |
|---|---|
| ✅ PASS | **7** |
| ❌ FAIL | **22** |
| **Total** | **29** |

#### Passing Tests (7)
1. `common/rate-limit/rate-limit.guard.spec.ts`
2. `common/rate-limit/rate-limit.service.spec.ts`
3. `notification/dispatch/dispatch.service.spec.ts`
4. `asset/asset-optimization.service.spec.ts`
5. `common/cache/cache.service.spec.ts`
6. `notification/sms/sms.service.spec.ts`
7. `notification/email/email.service.spec.ts`

#### Failing Tests (22)

**All failures share the same root cause:**

```
Cannot find module './generated-client' from 'packages/db/dist/index.js'
```

Affected suites:
- `admin/admin.service.spec.ts`
- `audit/audit.service.spec.ts`
- `auth/auth.service.spec.ts`
- `auth/guards/rbac-permission.guard.spec.ts`
- `billing/billing.service.spec.ts`
- `branch/branch.service.spec.ts`
- `common/e2e.spec.ts`
- `common/middleware/tenant-context.integration.spec.ts`
- `common/middleware/tenant-context.middleware.spec.ts`
- `common/repositories.spec.ts`
- `customer/customer.service.spec.ts`
- `device-token/device-token.service.spec.ts`
- `kds/kds.gateway.e2e.spec.ts`
- `kds/kds.gateway.integration.spec.ts`
- `kds/kds.gateway.spec.ts`
- `order/order.service.spec.ts`
- `payment/wallet.service.spec.ts`
- `subscription/subscription.service.spec.ts`
- `tenant/tenant.branding.spec.ts`
- `tenant/tenant.service.spec.ts`
- `webhook/webhook.service.spec.ts`

### 5.2 Playwright E2E Tests

**Config:** `playwright.config.ts`
- Test directory: `./tests/e2e`
- Browsers: Chromium, Firefox, WebKit
- Web servers: API on :8000, QR Menu on :3000
- **Status:** ⏭️ NOT RUN — blocked by broken builds (API won't start, frontend won't start)

**E2E test file:** `tests/e2e/checkout.spec.ts` (185 lines, 3 test cases)
- QR checkout flow with mocked APIs
- Tenant isolation across subdomains
- Cashier PWA offline/IndexedDB support

---

## 6. Prisma Schema

**File:** `packages/db/prisma/schema.prisma`
**Validation:** ⏱️ Timed out (prisma CLI not installed due to blocked post-install)

| Category | Count |
|---|---|
| Models | 29 |
| Enums | 8 |

### Models
Tenant, SubscriptionPlan, Subscription, User, Role, Permission, UserRole, RolePermission,
Restaurant, Branch, Table, Category, Product, ProductSize, ProductVariant, ProductAddon,
AddonItem, Order, OrderItem, OrderItemAddon, Customer, Payment, Invoice, AuditLog,
DeviceToken, KitchenQueue, SessionLog, Notification, Webhook

### Enums
TenantStatus, SubscriptionStatus, TableStatus, OrderType, OrderStatus, CookingStatus,
PaymentMethodType, PaymentStatus

---

## 7. Docker Infrastructure

**File:** `docker-compose.yml` (141 lines)

| # | Service | Image | Port | Health Check |
|---|---|---|---|---|
| 1 | `postgres-db` | `postgres:15-alpine` | 5432 | `pg_isready` ✅ |
| 2 | `pgbouncer` | `edoburu/pgbouncer:latest` | 6432 | ❌ None |
| 3 | `redis-cache` | `redis:7.2-alpine` | 6379 | `redis-cli ping` ✅ |
| 4 | `api-core` | Custom (Dockerfile) | 8000 | ❌ None |
| 5 | `queue-worker` | Custom (Dockerfile) | — | ❌ None |
| 6 | `qr-menu-app` | Custom (Dockerfile) | 3000 | ❌ None |
| 7 | `backoffice-app` | Custom (Dockerfile) | 3001→3000 | ❌ None |
| 8 | `cashier-app` | Custom (Dockerfile) | 3002→3000 | ❌ None |

**Volumes:** `pg-data`, `redis-data` (both local driver)

### ⚠️ Security Issues
- **Hardcoded credentials** in `docker-compose.yml`:
  - Postgres: `SecretPassword123!`
  - Redis: `SecretRedis123!`
- JWT keys referenced via Docker secrets (`/run/secrets/jwt_private_key`) — no secrets config defined
- No `.env` or `.env.example` files exist in the repo
- `.env` is properly listed in `.gitignore`

---

## 8. Environment Variables

### API (`apps/api/src/**/*.ts`) — 9 unique variables referenced

| Variable | Source File | Has Default? |
|---|---|---|
| `DATABASE_URL` | (Prisma) | ❌ No |
| `REDIS_URL` | `common/cache/cache.service.ts` | ✅ `redis://localhost:6379` |
| `JWT_SECRET` | `auth/config/jwt.config.ts` | ✅ Hardcoded fallback (insecure) |
| `JWT_REFRESH_SECRET` | `auth/config/jwt.config.ts` | ✅ Hardcoded fallback (insecure) |
| `NODE_ENV` | `auth/config/jwt.config.ts` | ✅ Defaults to non-production |
| `STRIPE_SECRET_KEY` | `billing/billing.service.ts` | ❌ No |
| `STRIPE_WEBHOOK_SECRET` | `billing/billing.service.ts` | ❌ No |
| `SYSTEM_PEPPER` | `auth/auth.service.ts` | ❌ No |
| `TAP_PAYMENTS_SECRET_KEY` | (payment module) | ❌ No |
| `AWS_ACCESS_KEY_ID` | `asset/asset-optimization.service.ts` | ❌ No |
| `AWS_REGION` | `asset/asset-optimization.service.ts` | ❌ No |
| `AWS_SECRET_ACCESS_KEY` | `asset/asset-optimization.service.ts` | ❌ No |
| `S3_BUCKET` | `asset/asset-optimization.service.ts` | ❌ No |

### Missing Configuration
- **No `.env` file** — must be created manually
- **No `.env.example`** — developers have no template
- `DATABASE_URL` and `STRIPE_SECRET_KEY` are required with no defaults

---

## 9. Monorepo Structure

```
zayjar-specification/
├── apps/
│   ├── api/          → NestJS modular monolith (port 8000)
│   ├── backoffice/   → Next.js 14 admin panel (port 3001)
│   ├── cashier/      → Next.js 14 offline-first PWA (port 3002)
│   └── qr-menu/      → Next.js 14 customer menu (port 3000)
├── packages/
│   ├── db/           → Prisma schema + client wrapper
│   └── types/        → Shared TypeScript types/enums/DTOs
├── tests/e2e/        → Playwright E2E tests
├── DOC-001.md … DOC-010.md  → 10 specification documents
├── PROJECT_MANIFEST.md       → Generated project inventory
└── turbo.json                → Turborepo pipeline config
```

---

## 10. Critical Blockers

### 🔴 BLOCKER 1: Prisma Client Generation (P0)

**Problem:** `prisma generate` has never been run. `@zayjar/db`'s `generated-client/` directory doesn't exist.

**Impact:**
- All 22 Jest test suites that import `@zayjar/db` fail immediately
- API server cannot start (`createApplicationContext` needs PrismaClient)
- Queue worker cannot start
- All E2E tests are blocked

**Fix:** Run interactively:
```bash
pnpm approve-builds        # Interactive — approve prisma, @prisma/client, @prisma/engines
pnpm install               # Re-triggers post-install scripts
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### 🟡 BLOCKER 2: Native Module Compilation (P1)

**Problem:** `argon2` and `sharp` require native compilation which is blocked by `pnpm approve-builds`.

**Impact:**
- Auth password hashing (`argon2`) will fail at runtime
- Image optimization (`sharp`) will fail at runtime

**Fix:** Same as above — approve builds for `argon2` and `sharp` in `pnpm approve-builds`.

### 🟡 BLOCKER 3: No `.env` or `.env.example` (P1)

**Problem:** No environment variable template exists. Required variables like `DATABASE_URL`, `STRIPE_SECRET_KEY`, `SYSTEM_PEPPER` have no documentation or defaults.

**Fix:** Create `.env.example` with all required variables documented.

---

## 11. Recommendations

| Priority | Action | Effort |
|---|---|---|
| P0 | Run `pnpm approve-builds` interactively to unblock Prisma + native modules | 2 min |
| P0 | Run `prisma generate` after approval | 30 sec |
| P1 | Create `.env.example` with all referenced env vars | 15 min |
| P1 | Move hardcoded Docker credentials to `.env` + reference via `${VAR}` | 30 min |
| P1 | Fix 5 TypeScript errors in `tenant-context.integration.spec.ts` | 30 min |
| P2 | Address 557 ESLint errors (primarily `no-explicit-any`) | 2-4 hrs |
| P2 | Add health checks to remaining Docker services | 30 min |
| P2 | Add `.dockerignore` if not present | 5 min |
| P3 | Fix `next lint` hang by adding explicit lint scripts | 30 min |
| P3 | Add pre-commit hooks (lint-staged + husky) | 1 hr |

---

## 12. Metrics Summary

| Metric | Value |
|---|---|
| Total tracked files | ~232 |
| Prisma models | 29 |
| Prisma enums | 8 |
| API controllers | 13 |
| API services | 25+ |
| Jest test suites | 29 |
| Jest tests passing | 7 / 29 (24%) |
| Jest tests failing | 22 / 29 (76%) |
| ESLint errors | 557 |
| ESLint warnings | 139 |
| E2E test cases | 3 (Playwright) |
| Docker services | 8 |
| DOC specification files | 10 |
| Environment variables | 13+ required |
| Missing env templates | `.env.example` does not exist |

---

*Report generated by TSK-0006 Health Check — 2026-07-24*
