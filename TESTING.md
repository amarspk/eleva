# TESTING.md — Manual Application Testing Index

> Entry point for manually inspecting and testing the **Zayjar Restaurant SaaS Platform** at the Phase 3 closure state (2026-08-14).
> Canonical engineering state: [`PROJECT_STATE.md`](./PROJECT_STATE.md) · Demo guide: [`DEMO.md`](./DEMO.md) · Operations/testing conventions: [`DOC-010.md`](./DOC-010.md)

---

## 1. Application layout

| Component | Path |
|---|---|
| API (NestJS, port 8000) | `apps/api` |
| QR Menu — public guest site (Next.js) | `apps/qr-menu` |
| Backoffice — admin dashboard (Next.js) | `apps/backoffice` |
| Cashier — PWA terminal (Next.js) | `apps/cashier` |
| Database package (Prisma schema + migrations + seed) | `packages/db` |
| Shared types package | `packages/types` |

---

## 2. Boot the application (verified 2026-08-14)

Sandbox toolchain (repository-documented, §18 of PROJECT_STATE.md): **Node 20**, pnpm via `npx -y pnpm@10.34.5`.

```bash
npx -y pnpm@10.34.5 install --frozen-lockfile
npx -y pnpm@10.34.5 --filter @zayjar/db run prisma:generate
npx -y pnpm@10.34.5 --filter @zayjar/types build
npx -y pnpm@10.34.5 --filter @zayjar/db build
npx -y pnpm@10.34.5 --filter @zayjar/api build

# Database (M4 orders_partitioning is parked per R2 — mark it applied first):
cd packages/db
npx prisma migrate resolve --applied 20260726000001_orders_partitioning_by_year
npx prisma migrate deploy
npx prisma db seed
cd ../..
```

Boot the API:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/zayjar?schema=public' \
REDIS_URL='redis://localhost:6379' \
JWT_SECRET='<32+ chars>' JWT_REFRESH_SECRET='<32+ chars>' STRIPE_WEBHOOK_SECRET='<any>' \
METRICS_TOKEN='<chosen token>' \
node apps/api/dist/main.js
```

One-command alternative: `bash scripts/demo.sh` (see `DEMO.md`).

---

## 3. Entry URLs

| Surface | URL |
|---|---|
| Liveness (process-only) | `http://localhost:8000/live` |
| Readiness (PostgreSQL) | `http://localhost:8000/ready` |
| Legacy health | `http://localhost:8000/health` |
| Prometheus metrics | `http://localhost:8000/metrics` — `Authorization: Bearer <METRICS_TOKEN>` |
| OpenAPI/Swagger UI | `http://localhost:8000/api/docs` — requires a PLATFORM_OWNER JWT |
| Tenant context (seeded) | `Host: albaik.localhost:8000` · `Host: tokyoramen.localhost:8000` |

---

## 4. Credentials for manual testing (verified 2026-08-14)

- **Seeded users** — `admin@albaik.com`, `manager@albaik.com`, `cashier@albaik.com`, `kitchen@albaik.com`, `admin@tokyoramen.com` all authenticate with password **`Demo1234!`** (real Argon2id hashes, Phase 4 P0). `platform@zayjar.ai` authenticates with **`Platform123!`** (see `DEMO.md`).
- **Real authentication:** onboard a fresh tenant, then log in:

```bash
# 1. planId = SELECT id FROM subscription_plans WHERE name='Starter';
curl -X POST http://localhost:8000/api/v1/tenants -H 'Content-Type: application/json' -d '{
  "companyName":"My Test Co","subdomain":"mytest","ownerFirstName":"Test",
  "ownerLastName":"Owner","ownerEmail":"mytest@example.com","ownerPassword":"password123",
  "planId":"<Starter plan id>","restaurantName":"My Test Restaurant"}'
# -> 201; then:
curl -X POST http://localhost:8000/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"mytest@example.com","password":"password123"}'
# -> 200 with accessToken + csrfToken; tenant context via Host: mytest.localhost:8000
```

- **Public menu with a seeded table token:** `GET /api/v1/public/menu?token=qr-albaik-r-7-1786741061024` with `Host: albaik.localhost:8000` → 200.

---

## 5. Core manual test matrix

Expected results below are the values proven by the Full-App Adversarial Pass (§19 row 59).

| # | Test | Request | Expected |
|---|---|---|---|
| 1 | Unauthenticated `/auth/me` | no tenant host / albaik host | **403** / **401** |
| 2 | Forged / `alg:none` / expired JWT | `Authorization: Bearer …` | **401** |
| 3 | Cross-tenant IDOR | foreign branch/customer/order id + own JWT | **404** (tenant id → **403**; `X-Tenant-ID` mismatch → **403**) |
| 4 | CSRF | POST without / with wrong `X-CSRF-Token` | **403** "CSRF token is required" / "validation failed" |
| 5 | Mass assignment | onboarding payload containing `tenantId` | **400** "property tenantId should not exist" |
| 6 | Uniqueness | duplicate subdomain / email onboarding | **409** |
| 7 | Enumeration | forgot-password known vs unknown email | identical generic response |
| 8 | Webhooks fail-closed | unsigned Stripe (`POST /api/v1/billing/webhooks`) / unsigned Tap (`POST /api/v1/payments/webhooks/tap`) or wrong `hashstring` header | **400** (Stripe requires tenant context or the middleware fail-safe blocks first; Tap requires `TAP_PAYMENTS_SECRET_KEY` configured — otherwise the documented dev-skip returns 200 in non-production) |
| 9 | Metrics gate | `/metrics` no / wrong / correct Bearer | **401 / 401 / 200** + `Cache-Control: no-store`; no tenant ids/emails/passwords in the exposition |
| 10 | Readiness | `/ready` with the database stopped | **503** (and `/live` stays **200**) |
| 11 | RBAC | staff user without permission calls protected route | **403** (allow-side returns 200) |

---

## 6. Automated suites (verified results)

- Root: `pnpm test` → **103/103 suites · 1099 passed · 2 skipped · 0 failed** (the 2 skips are the environment-conditional `media-concurrency` DB-integration suite — the documented standing baseline).
- TypeScript: api 0 / db 0 / types 0 errors. ESLint: clean.
- Production build: `turbo run build --concurrency=1` → **6/6**.

---

## 7. Known documented limitations (pre-existing, not defects of this pass)

- `MediaController` declares no `JwtAuthGuard` (documented runtime inconsistency — see OpenAPI contract note).
- CORS reflects the caller origin when `CORS_ORIGIN` is unset (documented production-hardening note).
- Tap webhook hashstring verification skips in dev when `TAP_PAYMENTS_SECRET_KEY` is unset (documented). The Tap webhook endpoint is `POST /api/v1/payments/webhooks/tap` (not `/api/v1/wallet/tap/webhook`).
- Email-verification login enforcement is disabled pre-launch (mandatory pre-launch gate, §19 row 53).
- Socket.io falls back to the in-memory adapter (documented SPEC-DRIFT).
- Newly onboarded tenants provision only the owner role; staff roles are provisioned separately.
- Docker image builds and browser `e2e-live` runs: **GitHub Actions is the environment of record**.

---

## 8. Navigation

- [`PROJECT_STATE.md`](./PROJECT_STATE.md) — canonical engineering state (§19 verification history, §29 backlog, §29.6 next task)
- [`DEMO.md`](./DEMO.md) — local demo environment
- [`DOC-010.md`](./DOC-010.md) — development, testing & operations
- [`README.md`](./README.md) — documentation index & site map
