# PROJECT MANIFEST — Zayjar Restaurant SaaS Platform

> Auto-generated repository inventory. Last updated: 2026-07-24.

---

## Repository Overview

**Project Purpose:** A multi-tenant, cloud-native Restaurant SaaS Platform enabling restaurants to manage menus, process orders, handle payments, display kitchen display systems (KDS), and operate cashier terminals — all with full tenant isolation.

**Technology Stack:**

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.4+ (strict mode) |
| Backend Framework | NestJS 10.x (modular monolith) |
| Frontend Framework | Next.js 14.x (React 18) |
| Database | PostgreSQL 15+ |
| ORM | Prisma 5.22 |
| Cache / Queue | Redis 7.2 |
| Connection Pooler | PgBouncer (transaction mode) |
| Real-time | Socket.io 4.x (WebSocket) |
| Auth | Passport-JWT (RS256), Argon2 password hashing, Speakeasy MFA |
| Payments | Stripe Billing + regional wallets (KNET, Benefit, Mada, Apple Pay) |
| Image Processing | Sharp (serverless WebP conversion), S3 pre-signed URLs |
| Monorepo Tooling | pnpm workspaces + Turborepo |
| Build | TypeScript (`tsc`) |
| Testing | Jest 29 (unit/integration), Playwright 1.44 (E2E) |
| Linting | ESLint 8.x + Prettier |
| Containerization | Docker multi-stage builds, Docker Compose |
| Reverse Proxy | NGINX (SSL termination, rate limiting, WebSocket proxy) |

**Monorepo Structure:**

```
zayjar-platform-monorepo/
├── apps/
│   ├── api/           — NestJS backend API + workers
│   ├── backoffice/    — Next.js tenant admin panel
│   ├── cashier/       — Next.js offline-first cashier PWA
│   └── qr-menu/       — Next.js customer QR menu browser
├── packages/
│   ├── db/            — Prisma schema, migrations, generated client, repositories
│   └── types/         — Shared TypeScript types, DTOs, enums, constants
├── tests/
│   └── e2e/           — Playwright end-to-end test suites
├── DOC-001.md through DOC-010.md — Engineering specification documents
├── docker-compose.yml
├── nginx.conf
├── playwright.config.ts
├── jest.config.js
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Applications

### 1. `@zayjar/api` — Backend API & Worker

| Field | Value |
|-------|-------|
| **Path** | `apps/api/` |
| **Framework** | NestJS 10.x (Express adapter) |
| **Port** | 8000 |
| **Purpose** | Core REST API, WebSocket gateway (KDS), background worker, cron scheduler |
| **Status** | Functional — all 13 controllers and 15 modules implemented |

**Modules registered:** Auth, Tenant, Branch, Menu, Order, KDS, Customer, Billing, Admin, Asset, Webhook, DeviceToken, Subscription, Audit, Payment, Cache.

**Key dependencies:** `@nestjs/*`, `@casl/ability`, `argon2`, `passport-jwt`, `redis`, `socket.io`, `stripe`, `sharp`, `speakeasy`, `qrcode`, `class-validator`.

### 2. `@zayjar/backoffice` — Tenant Backoffice Panel

| Field | Value |
|-------|-------|
| **Path** | `apps/backoffice/` |
| **Framework** | Next.js 14.x (React 18, CSR) |
| **Port** | 3001 |
| **Purpose** | Restaurant admin dashboard — branch management, menu categories, order monitoring, KDS terminal, platform metrics |
| **Status** | Functional — AdminPanel with TanStack Query, KDSTerminal with Socket.io |

**Key dependencies:** `@tanstack/react-query`, `socket.io-client`, `@zayjar/types`.

### 3. `@zayjar/cashier` — Cashier Terminal PWA

| Field | Value |
|-------|-------|
| **Path** | `apps/cashier/` |
| **Framework** | Next.js 14.x (React 18, PWA) |
| **Port** | 3002 |
| **Purpose** | Offline-first cashier point-of-sale terminal with IndexedDB local storage and Service Worker sync |
| **Status** | Functional — offline checkout, Service Worker background sync, PWA manifest |

**Key dependencies:** `idb` (IndexedDB wrapper), `@zayjar/types`.

### 4. `@zayjar/qr-menu` — Customer QR Menu Browser

| Field | Value |
|-------|-------|
| **Path** | `apps/qr-menu/` |
| **Framework** | Next.js 14.x (React 18) |
| **Port** | 3000 |
| **Purpose** | Public-facing customer menu — QR code scan → browse categories → configure items (sizes, variants, addons) → add to cart with dynamic price inheritance |
| **Status** | Functional — MenuBrowser with full pricing engine |

**Key dependencies:** `@zayjar/types`.

---

## Packages

### 1. `@zayjar/db` — Database Layer

| Field | Value |
|-------|-------|
| **Path** | `packages/db/` |
| **Purpose** | Prisma schema, generated client, tenant-aware repository classes |
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL 15+ |
| **Dependencies** | `@prisma/client` |

**Repository classes (16):** `BaseTenantRepository`, `TenantAddonItemRepository`, `TenantBranchRepository`, `TenantCategoryRepository`, `TenantCustomerRepository`, `TenantDeviceTokenRepository`, `TenantInvoiceRepository`, `TenantOrderItemRepository`, `TenantOrderRepository`, `TenantProductAddonRepository`, `TenantProductRepository`, `TenantProductSizeRepository`, `TenantRestaurantRepository`, `TenantTableRepository`, `TenantUserRepository`, `TenantWebhookRepository`.

### 2. `@zayjar/types` — Shared Types

| Field | Value |
|-------|-------|
| **Path** | `packages/types/` |
| **Purpose** | TypeScript interfaces, DTOs, enums, and platform constants shared across all apps |
| **Dependencies** | None (dev only: `typescript`) |

**Exports:** `UserProfile`, `TenantBranding`, 15 model interfaces (`TenantModel`, `OrderModel`, etc.), 8 DTOs (`LoginDto`, `CreateOrderDto`, etc.), 8 enums (`TenantStatus`, `OrderStatus`, etc.), `PLATFORM_LIMITS`, `SECURITY_CONFIG`, `IMAGE_LIMITS`, `BRAND_DEFAULTS`.

---

## Documentation

| Document | Title | Summary |
|----------|-------|---------|
| `DOC-001.md` | System Architecture | High-level cloud-native architecture blueprint covering the modular monolith pattern, traffic routing (Route 53, CloudFront, S3), API gateway layer (NGINX with JWT, rate limiting, CORS), and downstream service topology. Foundational reference for all other documents. |
| `DOC-002.md` | Database Schema & Data Dictionary | Complete PostgreSQL 15+ relational schema with 29 tables, UUIDv4 primary keys, foreign key constraints, audit columns (`created_at`, `updated_at`, `deleted_at`), indexes, enums, and soft-delete policies. The most extensive schema reference (~1,388 lines). |
| `DOC-003.md` | REST API Portal Reference | Exhaustive HTTP endpoint reference defining standard methods, JSON payloads, required headers (`Authorization`, `X-Tenant-ID`, `X-Branch-ID`, `X-Correlation-ID`), structured error responses, validation rules, and rate limits. |
| `DOC-004.md` | Master Technical Specification | Consolidated master document (~4,525 lines) encompassing all architectural domains: auth, multi-tenancy, subscription design, database schema with relationships/indexing/constraints/triggers, and every implementation module. The single-volume superset of all other documents. |
| `DOC-005.md` | Business Logic & Workflows | End-to-end tenant onboarding workflow (signup → subdomain validation → DB transaction creating tenant/subscription/user/restaurant/branch → Stripe customer creation → welcome email), branch context scoping, price inheritance engine, order state-machine, and secure QR generation. |
| `DOC-006.md` | Security & Cryptographic Standards | Security architecture: RS256 JWT with 2048-bit RSA keys, Redis session blacklist, sliding-window refresh token rotation via HttpOnly cookies, CSRF double-submit cookie pattern, SQL injection prevention, and rate limiting. |
| `DOC-007.md` | Image Storage & Processing Pipeline | File upload system using S3 pre-signed URLs (5-min TTL), multi-tenant S3 folder hierarchy, Lambda-triggered Sharp optimization (WebP conversion), CloudFront CDN caching, and access control validation. |
| `DOC-008.md` | Multi-Channel Notifications | Asynchronous notification dispatch: email (SES/SendGrid), SMS (Twilio), push (FCM), outbound webhooks (Socket.io rooms). BullMQ/Redis Streams queue system with provider failover, delivery monitoring, and bounce handling. |
| `DOC-009.md` | Third-Party Integrations | External integrations: Stripe Billing/Payment Intents, regional wallets (KNET, Benefit, Mada via Tap/PayTabs), GitHub monorepo structure, CI/CD (GitHub Actions), ELK Stack, Datadog APM, disaster recovery. |
| `DOC-010.md` | Performance, Testing & Operations | Performance engineering: Redis cache-aside/write-through with 2hr TTL, PostgreSQL optimization (EXPLAIN ANALYZE, vacuuming, PgBouncer), frontend performance (Next.js Image, code splitting), BullMQ worker architecture, Jest unit testing, Playwright E2E, Docker Compose, NGINX, AWS failover runbooks. |

---

## Database

| Field | Value |
|-------|-------|
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL 15+ |
| **Schema file** | `packages/db/prisma/schema.prisma` |
| **Total models** | 29 |
| **Migrations** | None checked in (managed via `prisma migrate`) |
| **Seed data** | Defined via `prisma:seed` script |

**Models:** Tenant, SubscriptionPlan, Subscription, User, Role, Permission, UserRole, RolePermission, Restaurant, Branch, Table, Category, Product, ProductSize, ProductVariant, ProductAddon, AddonItem, Order, OrderItem, OrderItemAddon, Customer, Payment, Invoice, AuditLog, DeviceToken, KitchenQueue, SessionLog, Notification, Webhook.

**Enums (8):** TenantStatus, SubscriptionStatus, TableStatus, OrderType, OrderStatus, CookingStatus, PaymentMethodType, PaymentStatus.

---

## APIs

### REST Endpoints (13 controllers, prefix: `/api/v1/`)

| Controller | Prefix | Key Endpoints |
|-----------|--------|---------------|
| AuthController | `/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `POST /mfa/enable`, `POST /mfa/verify` |
| TenantController | `/tenants` | `GET /:id`, `PUT /:id` (branding) |
| BranchController | `/branches` | CRUD for branches and tables |
| MenuController | `/menu` | Category and product management |
| OrderController | `/orders` | `POST /checkout`, order status updates |
| KdsController | `/kds` | `PUT /items/:id/status` (cooking status) |
| CustomerController | `/customers` | `POST /` (registration + loyalty) |
| BillingController | `/billing` | `POST /subscriptions/create-session` |
| AdminController | `/admin` | `GET /tenants/metrics` (platform owner) |
| AssetController | `/assets` | `POST /presigned-url` (S3 upload) |
| WebhookController | `/webhooks` | Inbound webhook management |
| DeviceTokenController | `/device-tokens` | `POST /` (FCM registration) |
| SubscriptionController | `/subscriptions` | Subscription and entitlement checks |

### Authentication

- **Strategy:** Passport-JWT with RS256 asymmetric keys (2048-bit RSA)
- **Token format:** JWT access token (15min expiry) + HttpOnly sliding refresh cookie (7-day expiry)
- **Password hashing:** Argon2
- **MFA:** TOTP via Speakeasy
- **Session blacklist:** Redis-backed token revocation
- **RBAC:** CASL ability factory for role-based + attribute-based access control

### Integrations

- **Stripe** — Billing subscriptions, payment intents, webhook sync
- **Apple Pay / Google Pay / KNET / Benefit / Mada** — Regional payment wallets
- **SendGrid / AWS SES** — Transactional email
- **Twilio** — SMS delivery
- **Firebase FCM** — Push notifications
- **Socket.io** — Real-time KDS WebSocket rooms

---

## Infrastructure

### Docker

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres-db` | `postgres:15-alpine` | 5432 | Primary relational database |
| `pgbouncer` | `edoburu/pgbouncer` | 6432 | Connection pooler (transaction mode, 10k max clients) |
| `redis-cache` | `redis:7.2-alpine` | 6379 | Cache, session blacklist, queue backend |
| `api-core` | Custom build (multi-stage) | 8000 | NestJS API server |
| `queue-worker` | Same as api-core | — | Background job processor |
| `qr-menu-app` | Custom build | 3000 | Customer QR menu frontend |
| `backoffice-app` | Custom build | 3001 | Tenant admin panel |
| `cashier-app` | Custom build | 3002 | Offline-first cashier PWA |

### NGINX

- SSL/TLS termination (TLSv1.2/1.3)
- Rate limiting: 10 req/min (auth), 120 req/min (API)
- WebSocket proxy for Socket.io KDS
- Security headers (CSP, X-Frame-Options, X-Content-Type-Options, XSS-Protection)
- Subdomain-based routing: `*.zayjar.com`, `admin.zayjar.com`, `cashier.zayjar.com`

### CI/CD

- **GitHub Actions** with branch protection (per DOC-009)
- **pnpm** workspace-aware build pipeline via Turborepo

### Environments

- Local development (Docker Compose)
- Test / CI
- Staging
- Production (AWS: ECS/EKS, RDS, ElastiCache, S3, CloudFront, Secrets Manager)

---

## Testing

### Unit Tests (30 spec files)

| Area | Files |
|------|-------|
| Auth | `auth.service.spec.ts`, `rbac-permission.guard.spec.ts` |
| Tenant | `tenant.service.spec.ts`, `tenant.branding.spec.ts` |
| Branch | `branch.service.spec.ts` |
| Order | `order.service.spec.ts` |
| KDS | `kds.gateway.spec.ts`, `kds.gateway.integration.spec.ts` |
| Customer | `customer.service.spec.ts` |
| Billing | `billing.service.spec.ts` |
| Admin | `admin.service.spec.ts` |
| Asset | `asset.service.spec.ts`, `asset-optimization.service.spec.ts` |
| Webhook | `webhook.service.spec.ts` |
| Device Token | `device-token.service.spec.ts` |
| Payment | `wallet.service.spec.ts` |
| Subscription | `subscription.service.spec.ts` |
| Notification | `email.service.spec.ts`, `sms.service.spec.ts`, `dispatch.service.spec.ts` |
| Audit | `audit.service.spec.ts` |
| Rate Limit | `rate-limit.service.spec.ts`, `rate-limit.guard.spec.ts` |
| Cache | `cache.service.spec.ts` |
| Middleware | `tenant-context.middleware.spec.ts`, `tenant-context.integration.spec.ts` |
| Repositories | `repositories.spec.ts` |
| Common | `e2e.spec.ts` |

### E2E Tests (Playwright)

| File | Scope |
|------|-------|
| `tests/e2e/checkout.spec.ts` | Full checkout flow: QR scan → menu browse → addon configuration → cart → checkout, tenant isolation across subdomains, offline cashier PWA IndexedDB verification |
| `apps/api/src/kds/kds.gateway.e2e.spec.ts` | KDS WebSocket gateway end-to-end |

**Playwright config:** Runs against Chromium, Firefox, and WebKit. Web servers: API (`:8000`) and QR Menu (`:3000`).

---

## Features Already Implemented

- [x] Multi-tenant architecture with tenant isolation (middleware, repositories, cache keys)
- [x] User authentication (JWT RS256, Argon2, HttpOnly refresh cookies)
- [x] Multi-Factor Authentication (TOTP via Speakeasy)
- [x] RBAC + ABAC via CASL ability factory
- [x] Tenant CRUD with branding (logo, banner, colors)
- [x] Restaurant and branch management with tables
- [x] Menu system: categories, products, sizes, variants, addons
- [x] Dynamic price inheritance engine (base → size → variant → addons)
- [x] Order processing engine with state machine (DRAFT → PENDING → ACCEPTED → PREPARING → READY → COMPLETED)
- [x] Checkout API with invoice generation
- [x] Real-time Kitchen Display System (KDS) via Socket.io with room scoping
- [x] KDS priority escalation (NORMAL → RUSH after 15min)
- [x] Cashier Terminal PWA with offline-first architecture (IndexedDB + Service Worker)
- [x] Background sync via Service Worker SyncManager API with fallback
- [x] Customer QR menu browser with search, category filtering, and item customization
- [x] Platform admin metrics endpoint (MRR, ARR, tenant count)
- [x] Subscription management with plan-based entitlements
- [x] Stripe billing integration (subscription checkout sessions)
- [x] Asset pre-signed URL upload (S3)
- [x] Tenant-aware repository layer (16 repositories)
- [x] Global audit interceptor
- [x] Redis cache service
- [x] Rate limiting (auth: 10/min, API: 120/min)
- [x] Tenant context middleware (subdomain, header, custom domain resolution)
- [x] Webhook subsystem
- [x] Device token registration (FCM)
- [x] Notification dispatch (email, SMS)
- [x] 29-table Prisma schema with indexes and constraints
- [x] Docker Compose orchestration (8 services)
- [x] Multi-stage Dockerfiles for API and all frontends
- [x] NGINX reverse proxy with SSL, rate limiting, security headers, WebSocket support
- [x] E2E checkout flow test (Playwright, 3 test cases)
- [x] 30 unit/integration test suites

---

## Known TODOs

| File | Line | Note |
|------|------|------|
| `packages/db/src/generated-client/runtime/library.d.ts` | 866 | `count = "count",// TODO: count does not actually exist, why?` |
| `packages/db/src/generated-client/runtime/library.d.ts` | 2596 | `/** TODO what is this */` |
| `packages/db/src/generated-client/runtime/library.d.ts` | 2598 | `/** TODO what is this */` |

> **Note:** All 3 TODOs are inside Prisma-generated client code, not hand-written source. No FIXME or HACK markers were found in application code.

---

## Technical Debt

1. **`apps/api/src/main.ts` uses `createApplicationContext` instead of `createNestApplication`** — The API bootstrap creates an application context and immediately closes it. The actual HTTP server is not started in the current `main.ts`. This means the API is not bootable as-is without a Dockerfile CMD override or a separate entry point.

2. **Hardcoded credentials in `docker-compose.yml`** — Postgres password (`SecretPassword123!`) and Redis password (`SecretRedis123!`) are committed in plaintext. These should be migrated to Docker secrets or environment variable references before any non-local deployment.

3. **No database migrations checked in** — The Prisma schema exists but no `prisma/migrations/` directory is present. Migrations are presumably applied at deploy time but the migration history is not version-controlled.

4. **No `node_modules/` install verification** — No CI lockfile check or install step is configured in the repository root. The `pnpm-lock.yaml` exists but cannot be verified without running `pnpm install`.

5. **Cashier product catalog is hardcoded** — `CashierTerminal.tsx` renders a static list of 3 products rather than fetching from the API. This is functional for demo purposes but represents incomplete integration.

6. **Frontend apps lack tests** — No unit or integration tests exist for `backoffice`, `cashier`, or `qr-menu` frontend applications. Only API-side tests are present.

---

## Suggested Roadmap

### Priority 1 — Correctness & Stability
1. Fix `main.ts` bootstrap to use `createNestApplication` so the API starts as a real HTTP server
2. Move hardcoded credentials to Docker secrets / `.env` files and add `.env` to `.gitignore`
3. Initialize Prisma migrations directory and commit migration history
4. Replace hardcoded cashier product list with live API fetch

### Priority 2 — Testing & Quality
5. Add unit tests for frontend components (MenuBrowser, AdminPanel, CashierTerminal)
6. Add integration tests for the checkout flow (API → DB → response)
7. Set up ESLint enforcement in CI (currently configured but no CI pipeline visible)
8. Add Prisma seed script with realistic test data

### Priority 3 — Feature Completeness
9. Implement real-time KDS push notifications on order status changes from API
10. Complete notification dispatch integration (SendGrid/Twilio/FCM)
11. Add Stripe webhook endpoint for subscription lifecycle events
12. Implement image upload → S3 pipeline with Sharp optimization

### Priority 4 — Operations & Scale
13. Add health check endpoint (`GET /api/v1/health`)
14. Set up structured logging (Winston) with correlation IDs
15. Add Datadog APM or OpenTelemetry tracing
16. Create Kubernetes manifests or ECS task definitions for production deployment
17. Implement database backup and point-in-time recovery procedures

---

*End of PROJECT_MANIFEST.md*
