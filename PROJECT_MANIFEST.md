# PROJECT MANIFEST — Zayjar Restaurant SaaS Platform

> Auto-generated repository inventory. Last updated: 2026-07-27.

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
| Cache / Queue | Redis 7.2 (BullMQ) |
| Connection Pooler | PgBouncer (transaction mode) |
| Real-time | Socket.io 4.x (WebSocket) |
| Auth | Passport-JWT (RS256), Argon2, Speakeasy MFA |
| Payments | Stripe Billing + regional wallets (KNET, Benefit, Mada, Apple Pay) |
| Image Processing | Sharp (serverless WebP conversion), S3 pre-signed URLs |
| CDN | CloudFront (OAC, immutable cache, security headers) |
| Logging | Winston (structured JSON, ELK-compatible), Datadog APM |
| Monorepo Tooling | pnpm workspaces + Turborepo |
| Build | TypeScript (`tsc`) |
| Testing | Jest 29 (unit/integration), Playwright 1.44 (E2E) |
| Linting | ESLint 8.x (zero-error CI enforcement) |
| Containerization | Docker multi-stage builds, Docker Compose |
| Orchestration | Kubernetes (HPA, PDB, Kustomize) |
| Reverse Proxy | NGINX (TLS 1.2/1.3, rate limiting, WebSocket proxy) |

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
├── infra/
│   └── cloudfront/    — CloudFormation templates, cache invalidation scripts
├── k8s/               — Kubernetes manifests (26 files)
├── tests/
│   └── e2e/           — Playwright end-to-end test suites
├── .github/
│   ├── workflows/     — CI/CD GitHub Actions (ci.yml, cd.yml)
│   └── scripts/       — Health check, rollback scripts
├── DOC-001.md through DOC-010.md — Engineering specification documents
├── SPEC_INDEX.md      — Requirement-level implementation tracking
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
| **Status** | Production-ready — 14 controllers, 30 services, 24 modules, 6 guards, 4 middleware, 1 interceptor |

**Modules registered:** Auth, Tenant, Branch, Menu, Order, KDS, Customer, Billing, Admin, Asset, Webhook, DeviceToken, Subscription, Audit, Payment, Cache, Media, Notification, Queue, Logging, Secrets, Sanitization, EventEmitter.

**Key dependencies:** `@nestjs/*`, `@casl/ability`, `argon2`, `passport-jwt`, `redis`, `ioredis`, `socket.io`, `stripe`, `sharp`, `speakeasy`, `qrcode`, `class-validator`, `xss`, `winston`, `bullmq`, `dd-trace`, `@aws-sdk/client-secrets-manager`.

### 2. `@zayjar/backoffice` — Tenant Backoffice Panel

| Field | Value |
|-------|-------|
| **Path** | `apps/backoffice/` |
| **Framework** | Next.js 14.x (React 18, CSR) |
| **Port** | 3001 |
| **Purpose** | Restaurant admin dashboard — branch management, menu categories, order monitoring, KDS terminal, platform metrics |
| **Status** | Functional — AdminPanel with TanStack Query, KDSTerminal via dynamic import |

**Key dependencies:** `@tanstack/react-query`, `socket.io-client`, `next/dynamic`, `@zayjar/types`.

### 3. `@zayjar/cashier` — Cashier Terminal PWA

| Field | Value |
|-------|-------|
| **Path** | `apps/cashier/` |
| **Framework** | Next.js 14.x (React 18, PWA) |
| **Port** | 3002 |
| **Purpose** | Offline-first cashier point-of-sale terminal with IndexedDB local storage and Service Worker sync |
| **Status** | Functional — offline checkout, Service Worker background sync, PWA manifest, dynamic import |

**Key dependencies:** `idb` (IndexedDB wrapper), `next/dynamic`, `@zayjar/types`.

### 4. `@zayjar/qr-menu` — Customer QR Menu Browser

| Field | Value |
|-------|-------|
| **Path** | `apps/qr-menu/` |
| **Framework** | Next.js 14.x (React 18) |
| **Port** | 3000 |
| **Purpose** | Public-facing customer menu — QR code scan → browse categories → configure items (sizes, variants, addons) → add to cart with dynamic price inheritance |
| **Status** | Functional — MenuBrowser with Next.js Image priority optimization, lazy loading |

**Key dependencies:** `next/image`, `@zayjar/types`.

---

## Packages

### 1. `@zayjar/db` — Database Layer

| Field | Value |
|-------|-------|
| **Path** | `packages/db/` |
| **Purpose** | Prisma schema, generated client, tenant-aware repository classes, migration tooling, backup scripts |
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL 15+ |
| **Dependencies** | `@prisma/client` |

**Repository classes (18):** `BaseTenantRepository`, `TenantAddonItemRepository`, `TenantBranchRepository`, `TenantCategoryRepository`, `TenantCustomerRepository`, `TenantDeviceTokenRepository`, `TenantInvoiceRepository`, `TenantMediaRepository`, `TenantOrderItemRepository`, `TenantOrderRepository`, `TenantProductAddonRepository`, `TenantProductRepository`, `TenantProductSizeRepository`, `TenantRestaurantRepository`, `TenantTableRepository`, `TenantTenantRepository`, `TenantUserRepository`, `TenantWebhookRepository`.

**Scripts & tooling:** `backup-postgres.sh`, `restore-postgres.sh`, `wal-archive.sh`, `verify-backup-full.sh`, `migrate-status.sh`, `migrate-validate.sh`, `migrate-backup-verify.sh`, `migrate-post-verify.sh`, `query-profiling.sql`, `db-health-checks.sql`, `optimize-tables.sql`, `maintenance.sh`.

**Documentation:** `MIGRATION.md`, `BACKUP-RECOVERY.md`, `ENCRYPTION.md`.

### 2. `@zayjar/types` — Shared Types

| Field | Value |
|-------|-------|
| **Path** | `packages/types/` |
| **Purpose** | TypeScript interfaces, DTOs, enums, and platform constants shared across all apps |
| **Dependencies** | None (dev only: `typescript`) |

**Exports:** `UserProfile`, `TenantBranding`, 15 model interfaces (`TenantModel`, `OrderModel`, etc.), 8 DTOs (`LoginDto`, `CreateOrderDto`, etc.), 9 enums (`TenantStatus`, `OrderStatus`, `CookingStatus`, etc.), `PLATFORM_LIMITS`, `SECURITY_CONFIG`, `IMAGE_LIMITS`, `BRAND_DEFAULTS`.

---

## Documentation

| Document | Title | Sections |
|----------|-------|----------|
| `DOC-001.md` | System Architecture | 10 sections (§1.1–§1.10) |
| `DOC-002.md` | Database Schema & Data Dictionary | 9 sections (§2.1–§2.9) |
| `DOC-003.md` | REST API Portal Reference | 11 sections (§3.1–§3.11) |
| `DOC-004.md` | Master Technical Specification | Consolidated superset of all documents |
| `DOC-005.md` | Business Logic & Workflows | 8 sections (§4.1–§4.8) |
| `DOC-006.md` | Security & Cryptographic Standards | 9 sections (§5.1–§5.9) |
| `DOC-007.md` | Image Storage & Processing Pipeline | 5 sections (§6.1–§6.5) |
| `DOC-008.md` | Multi-Channel Notifications | 6 sections (§7.1–§7.6) |
| `DOC-009.md` | Third-Party Integrations | 5 sections (§8.1–§8.5) |
| `DOC-010.md` | Performance, Testing & Operations | 13 sections (§9.1–§10.8) |
| `SPEC_INDEX.md` | Requirement Tracking | 76 requirements, 75 implemented, 1 vendor-blocked |

---

## Database

| Field | Value |
|-------|-------|
| **ORM** | Prisma 5.22 |
| **Database** | PostgreSQL 15+ |
| **Schema file** | `packages/db/prisma/schema.prisma` |
| **Total models** | 30 |
| **Enums** | 9 |
| **Migrations** | 6 (committed, version-controlled) |

**Models:** Tenant, SubscriptionPlan, Subscription, User, Role, Permission, UserRole, RolePermission, Restaurant, Branch, Table, Category, Product, ProductSize, ProductVariant, ProductAddon, AddonItem, Order, OrderItem, OrderItemAddon, Customer, Payment, Invoice, AuditLog, DeviceToken, KitchenQueue, SessionLog, Notification, Webhook, Media.

**Enums:** TenantStatus, SubscriptionStatus, TableStatus, OrderType, OrderStatus, CookingStatus, PaymentMethodType, PaymentStatus, MediaStorageProvider.

**Migrations:**
1. `20250713000000_init` — Initial schema (29 tables)
2. `20250725000000_add_media_model` — Media table for asset management
3. `20250725000001_add_tenant_branding_jsonb` — Tenant branding JSONB column
4. `20260713120000_add_orders_table_partitioning` — Orders table partitioning
5. `20260726100000_add_search_indexes` — GIN full-text search, KDS polling indexes
6. `20260726100001_add_lifecycle_triggers` — updated_at triggers, order audit trigger

---

## APIs

### REST Endpoints (14 controllers, prefix: `/api/v1/`)

| Controller | Prefix | Key Endpoints |
|-----------|--------|---------------|
| AuthController | `/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `POST /mfa/enable`, `POST /mfa/verify` |
| TenantController | `/tenants` | `GET /:id`, `PUT /:id` (branding) |
| BranchController | `/branches` | CRUD for branches and tables |
| MenuController | `/menu` | Category and product management |
| OrderController | `/orders` | `POST /checkout`, order status updates |
| KdsController | `/kds` | `PUT /items/:id/status` (cooking status) |
| CustomerController | `/customers` | `POST /` (registration + loyalty) |
| BillingController | `/billing` | `POST /subscriptions/create-session`, webhook endpoint |
| AdminController | `/admin` | `GET /tenants/metrics` (platform owner) |
| AssetController | `/assets` | `POST /presigned-url` (S3 upload) |
| WebhookController | `/webhooks` | Inbound webhook management |
| DeviceTokenController | `/device-tokens` | `POST /` (FCM registration) |
| SubscriptionController | `/subscriptions` | Subscription and entitlement checks |
| MediaController | `/media` | Image upload, processing, CDN URL generation |

### Authentication

- **Strategy:** Passport-JWT with RS256 asymmetric keys (2048-bit RSA)
- **Token format:** JWT access token (15min expiry) + HttpOnly sliding refresh cookie (7-day expiry)
- **Password hashing:** Argon2id
- **MFA:** TOTP via Speakeasy
- **Session blacklist:** Redis-backed token revocation
- **RBAC:** CASL ability factory for role-based + attribute-based access control
- **CSRF:** Double-submit token pattern with Redis-backed storage, constant-time validation

### Security

- **Rate limiting:** Redis fixed-window (10/min auth, 120/min API, 30/min checkout)
- **Input sanitization:** Global middleware using `xss` library, recursive nested object sanitization
- **Secrets management:** AWS Secrets Manager integration with env var fallback
- **Encryption:** TLS 1.2/1.3 (NGINX), S3 AES256 server-side encryption, Redis TLS support
- **Audit:** Immutable audit logs on all mutating operations

### Integrations

- **Stripe** — Complete subscription lifecycle webhook handler, payment intents, idempotency
- **Apple Pay / Google Pay** — Via Stripe Checkout (fully functional)
- **KNET / Benefit / Mada** — Stub integration (blocked on Tap/PayTabs vendor credentials)
- **SendGrid** — Transactional email (welcome, invoice, password-reset)
- **Twilio** — SMS delivery with regional routing and failover
- **Firebase FCM** — Push notifications with device token management
- **Socket.io** — Real-time KDS WebSocket rooms with Redis adapter
- **AWS Secrets Manager** — Centralized secrets management

---

## Infrastructure

### Docker (8 services)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres-db` | `postgres:15-alpine` | 5432 | Primary relational database |
| `pgbouncer` | `edoburu/pgbouncer` | 6432 | Connection pooler (transaction mode) |
| `redis-cache` | `redis:7.2-alpine` | 6379 | Cache, session blacklist, queue backend |
| `api-core` | Custom build (multi-stage) | 8000 | NestJS API server |
| `queue-worker` | Same as api-core | — | BullMQ background job processor |
| `qr-menu-app` | Custom build | 3000 | Customer QR menu frontend |
| `backoffice-app` | Custom build | 3001 | Tenant admin panel |
| `cashier-app` | Custom build | 3002 | Offline-first cashier PWA |

### Kubernetes (26 manifests)

- Namespace isolation, ConfigMaps, Secrets
- Deployments for API, Worker, QR Menu, Backoffice, Cashier
- StatefulSet for PostgreSQL, Deployment for Redis, PgBouncer
- HPA (API: 2–10 pods, Worker: 2–6 pods)
- PodDisruptionBudget for API
- NGINX Ingress with TLS (cert-manager)
- Kustomize orchestration

### NGINX

- TLS 1.2/1.3 with hardened cipher suite (ECDHE/DHE-only)
- `ssl_session_tickets off`, `ssl_stapling on`
- Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS)
- Rate limiting: 10 req/min (auth), 120 req/min (API)
- WebSocket proxy for Socket.io KDS
- CDN proxy for CloudFront media URLs
- Subdomain-based routing: `*.zayjar.com`, `admin.zayjar.com`, `cashier.zayjar.com`

### CloudFront CDN

- CloudFormation distribution with OAC origin access control
- Image-optimized cache policy (365-day immutable)
- Security headers at edge (X-Content-Type-Options, X-Frame-Options, HSTS)
- 403→404 error masking, IPv6, PriceClass_100
- Cache invalidation script with `--dry-run` mode

### CI/CD (GitHub Actions)

- **CI:** 4 parallel jobs (lint, test, build, Docker verification)
- **CD:** Docker image build/push to GHCR, staging → production deployment
- Branch protection with required status checks
- Health check and rollback scripts

### Environments

- Local development (Docker Compose)
- Test / CI
- Staging (`.env.staging.example`)
- Production (`.env.production.example` — AWS: ECS/EKS, RDS, ElastiCache, S3, CloudFront, Secrets Manager)

---

## Testing

### Unit & Integration Tests (55 suites, 445 passing tests)

| Area | Spec Files |
|------|-----------|
| Auth | `auth.service.spec.ts`, `rbac-permission.guard.spec.ts` |
| Tenant | `tenant.service.spec.ts`, `tenant.branding.spec.ts` |
| Branch | `branch.service.spec.ts` |
| Menu | `menu.service.spec.ts` |
| Order | `order.service.spec.ts`, `order.checkout.integration.spec.ts` |
| KDS | `kds.service.spec.ts`, `kds.gateway.spec.ts`, `kds.gateway.integration.spec.ts`, `kds.gateway.e2e.spec.ts` |
| Customer | `customer.service.spec.ts` |
| Billing | `billing.service.spec.ts`, `billing-notification.listener.spec.ts` |
| Admin | `admin.service.spec.ts` |
| Health | `health.controller.spec.ts` |
| Asset | `asset.service.spec.ts`, `asset-optimization.service.spec.ts` |
| Media | `media.service.spec.ts`, `media.controller.integration.spec.ts`, `media-cleanup.service.spec.ts`, `media-cleanup-queue.service.spec.ts`, `media-retry-cleanup.spec.ts`, `image-processor.service.spec.ts`, `local-storage.provider.spec.ts`, `s3-storage.provider.spec.ts` |
| Webhook | `webhook.service.spec.ts` |
| Device Token | `device-token.service.spec.ts` |
| Payment | `wallet.service.spec.ts` |
| Subscription | `subscription.service.spec.ts` |
| Notification | `email.service.spec.ts`, `sms.service.spec.ts`, `dispatch.service.spec.ts` |
| Audit | `audit.service.spec.ts` |
| Rate Limit | `rate-limit.service.spec.ts`, `rate-limit.guard.spec.ts` |
| Cache | `cache.service.spec.ts` |
| Queue | `queue.module.spec.ts`, `queue-health.service.spec.ts`, `queue.constants.spec.ts` |
| CSRF | `csrf.service.spec.ts`, `csrf.guard.spec.ts` |
| Sanitization | `sanitization.service.spec.ts`, `sanitization.middleware.spec.ts` |
| Logging | `logger.service.spec.ts`, `correlation-id.middleware.spec.ts`, `http-logging.middleware.spec.ts`, `sensitive-data.mask.spec.ts` |
| Secrets | `secrets-manager.service.spec.ts` |
| Middleware | `tenant-context.middleware.spec.ts`, `tenant-context.integration.spec.ts` |
| DB | `db-read-replica.spec.ts`, `repositories.spec.ts` |
| Common | `e2e.spec.ts` |

### E2E Tests (Playwright)

| File | Scope |
|------|-------|
| `tests/e2e/checkout.spec.ts` | Full checkout flow: QR scan → menu browse → addon configuration → cart → checkout |
| `tests/e2e/order-lifecycle.spec.ts` | Order state machine transitions |
| `tests/e2e/kds-display.spec.ts` | KDS WebSocket real-time updates |
| `tests/e2e/tenant-isolation.spec.ts` | Cross-tenant data isolation verification |
| `apps/api/src/kds/kds.gateway.e2e.spec.ts` | KDS WebSocket gateway end-to-end |

---

## Feature Implementation Status

### Implemented (75/76 requirements)

- [x] Multi-tenant architecture with full isolation (middleware, repositories, cache keys)
- [x] User authentication (JWT RS256, Argon2, HttpOnly refresh cookies)
- [x] Multi-Factor Authentication (TOTP via Speakeasy)
- [x] RBAC + ABAC via CASL ability factory
- [x] CSRF double-submit token mitigation
- [x] XSS sanitization pipelines (xss library, global middleware)
- [x] SQL injection defenses (Prisma ORM, parameterized queries)
- [x] Distributed rate limiting (Redis fixed-window)
- [x] Immutable structured audit logs
- [x] Encryption standards (TLS 1.2/1.3, S3 AES256, Redis TLS)
- [x] Enterprise secrets management (AWS Secrets Manager)
- [x] Tenant CRUD with branding (logo, banner, colors)
- [x] Restaurant and branch management with tables
- [x] Menu system: categories, products, sizes, variants, addons
- [x] Dynamic price inheritance engine (base → size → variant → addons)
- [x] Full-text menu search (GIN index on `tsv_menu_search`)
- [x] Database lifecycle triggers (updated_at on 8 tables, order audit trigger)
- [x] Order processing engine with state machine (DRAFT → PENDING → ACCEPTED → PREPARING → READY → COMPLETED)
- [x] Checkout API with invoice generation
- [x] Real-time Kitchen Display System (KDS) via Socket.io with Redis adapter
- [x] KDS priority escalation (NORMAL → RUSH after 15min)
- [x] Cashier Terminal PWA with offline-first architecture (IndexedDB + Service Worker)
- [x] Customer QR menu browser with search, category filtering, and item customization
- [x] Platform admin metrics endpoint (MRR, ARR, tenant count)
- [x] Subscription management with plan-based entitlements
- [x] Stripe billing integration (complete subscription lifecycle webhook handler)
- [x] Asset pre-signed URL upload (S3) with image optimization (Sharp/WebP)
- [x] CloudFront CDN edge caching with cache invalidation
- [x] Tenant-aware repository layer (18 repositories)
- [x] Global audit interceptor
- [x] Redis cache service with cache-aside/write-through patterns
- [x] Rate limiting (auth: 10/min, API: 120/min, checkout: 30/min)
- [x] Tenant context middleware (subdomain, header, custom domain resolution)
- [x] Webhook subsystem (HMAC-SHA256, exponential backoff)
- [x] Device token registration (FCM)
- [x] Multi-channel notification dispatch (email, SMS, push)
- [x] BullMQ worker architecture with per-queue concurrency
- [x] Winston structured logging (JSON format, daily rotation, ELK-compatible)
- [x] Sensitive data masking on all log outputs
- [x] Correlation ID middleware (X-Request-ID)
- [x] HTTP request/response logging middleware
- [x] Datadog APM integration (conditional on DD_AGENT_HOST)
- [x] 30-model Prisma schema with indexes, constraints, and triggers
- [x] 6 committed migrations (version-controlled)
- [x] Docker Compose orchestration (8 services)
- [x] Multi-stage Dockerfiles for API and all frontends
- [x] Kubernetes manifests (26 files, HPA, PDB, Kustomize)
- [x] NGINX reverse proxy (TLS 1.2/1.3, security headers, CDN proxy)
- [x] CloudFront CDN (CloudFormation, OAC, immutable cache)
- [x] CI/CD pipelines (GitHub Actions, CI + CD workflows)
- [x] Zero-downtime migration strategy documentation
- [x] Database optimization tooling (EXPLAIN ANALYZE, vacuuming, PgBouncer)
- [x] Automated backups & disaster recovery (pg_dump, WAL archiving, PITR)
- [x] ESLint zero-error CI enforcement (no-explicit-any, explicit-function-return-type)
- [x] Complete environment variable sets (.env.example, .env.staging, .env.production)
- [x] Next.js Image optimization (priority loading, lazy loading)
- [x] Dynamic imports for heavy components (KDSTerminal, CashierTerminal)
- [x] E2E checkout flow test (Playwright)
- [x] 445 passing unit/integration/E2E tests across 55 spec suites

### External Vendor Dependency (1 requirement)

- [~] **§8.3 Regional Wallet Integrations** — Engineering complete (stub wired into payment flow). Tap Payments / PayTabs SDK integration for KNET (Kuwait), Benefit (Bahrain), Mada (Saudi Arabia) requires vendor API credentials, sandbox access, and regional compliance certification. Apple Pay and Google Pay are fully operational via Stripe Checkout.

---

## Known TODOs

| File | Line | Note |
|------|------|------|
| `packages/db/src/generated-client/runtime/library.d.ts` | 866 | `count = "count",// TODO: count does not actually exist, why?` |
| `packages/db/src/generated-client/runtime/library.d.ts` | 2596 | `/** TODO what is this */` |
| `packages/db/src/generated-client/runtime/library.d.ts` | 2598 | `/** TODO what is this */` |

> **Note:** All 3 TODOs are inside Prisma-generated client code, not hand-written source. No FIXME or HACK markers in application code.

---

## Statistics

| Metric | Value |
|--------|-------|
| **Tracked files** | 364 |
| **Lines of code/docs** | ~46,800 |
| **Prisma models** | 30 |
| **Prisma enums** | 9 |
| **Committed migrations** | 6 |
| **REST controllers** | 14 |
| **Services** | 30 |
| **NestJS modules** | 24 |
| **Guards** | 6 |
| **Middleware** | 4 |
| **DTOs** | 18 |
| **Repository classes** | 18 |
| **Kubernetes manifests** | 26 |
| **Test spec files** | 55 |
| **Passing tests** | 445 |
| **E2E test files** | 5 |
| **Docker services** | 8 |
| **CI/CD workflows** | 2 (ci.yml, cd.yml) |
| **Infrastructure scripts** | 11 (backup, restore, migration, optimization) |
| **Documentation files** | 14 (10 DOCs + SPEC_INDEX + PROJECT_MANIFEST + 3 DB docs) |

---

*End of PROJECT_MANIFEST.md*
