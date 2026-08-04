# Phase 2 — Frontend Completion (AUDIT-014) · Progress Log

**Status:** Products + Categories COMPLETE. 4 modules remain.
**Constraints honoured:** `PROJECT_STATE.md` sha256 unchanged (`c2618f6d…d51a`) · no commits · no pushes.

---

## Verification matrix (current)

| Gate | Result |
|---|---|
| TypeScript — types / db / api / backoffice | **0 / 0 / 0 / 0** |
| ESLint | **6 / 6 workspaces clean** |
| Unit + integration tests | **837 passed**, 2 skipped, **0 failed** (Phase-1 baseline 717 → **+120**) |
| Build (`turbo run build`) | **6 / 6** |
| Browser E2E — Products | **19 / 19** |
| Browser E2E — Categories | **21 / 21** |
| Adversarial — Products | **7 / 7** |
| Adversarial — Categories | **13 / 13** |

---

## Defects found and fixed this phase

All were **reproduced at runtime before any code changed**.

### DEFECT-H — customer PII readable with no authentication ⚠️ CRITICAL
`CustomerController` had **no `@UseGuards`**, and the app registers no global auth
guard (only `CsrfGuard` is an `APP_GUARD`).

```
curl http://albaik.localhost:8000/api/v1/customers        # no Authorization header
-> HTTP 200
[{"firstName":"Noura","email":"noura.saeed@email.com","loyaltyPoints":75,...}]
```

The tenant's entire customer table — names, emails, phone numbers, loyalty
balances — was world-readable. **Fixed:** class-level `JwtAuthGuard +
RbacPermissionGuard`, per-route `@RequirePermission(<action>, 'Customer')`,
`Customer` added as a CASL subject and to the guard's repository registry, plus
a permissions migration. `POST` stays `@Public()` (guest self-registration).

*Runtime after:* anon GET/PUT/DELETE/restore → **401**; anon POST → **201**;
owner GET → **200**.

### DEFECT-I — CSRF protection globally inert (51 mutating routes) ⚠️
`CsrfGuard` is an `APP_GUARD`, so Nest runs it **before** the controller-level
`JwtAuthGuard`. Its code assumed the opposite ("JwtAuthGuard runs first"), so
`request.user` was always `undefined` and every request hit the
`if (!user?.id) return true` bypass.

```
PUT /api/v1/menu/products/:id   X-CSRF-Token: TOTALLY-BOGUS-VALUE-123
-> HTTP 200      (a forged token was accepted)
```

The existing unit tests passed because they **inject `user` by hand** — a
textbook case for runtime verification. **Fixed:** the guard now verifies the
bearer token itself (verify-only, no DB) instead of depending on guard ordering.

*Runtime after:* missing token → **403**, forged token → **403**, valid → **200**,
`@Public()` routes and GETs unaffected.

### DEFECT-J — restore endpoints unreachable from any client
The 5 restore endpoints shipped in Phase 1 could never be used: every list
endpoint filters `deletedAt IS NULL`, so no client could obtain the id of an
archived record. **Fixed:** opt-in `?includeDeleted=true` on products,
categories, branches, tables and customers.

### DEFECT-J(b) — global ValidationPipe silently mangled the new flag
Declaring the handler param as `boolean` let the global `ValidationPipe`
(`transform: true`) coerce the raw text *before* the param pipe ran. Measured:
`"1"` → false, `"0"` → false, `"yes"` → false — so `?includeDeleted=1` silently
did nothing and invalid input never produced a 400. **Fixed:** declare the param
as `string` and let `BooleanQueryPipe` validate the raw value.

*Runtime after:* `true`/`1` → archived visible; `false`/`0` → hidden;
`yes`/`maybe`/SQLi string → **400**.

### DEFECT-K — CORS wildcard broke every browser call ⚠️
Only visible in a real browser; **curl does not enforce CORS**.

```
Access to fetch at 'http://albaik.localhost:8000/api/v1/menu/products'
from origin 'http://albaik.localhost:3001' has been blocked by CORS policy:
the value of 'Access-Control-Allow-Origin' must not be the wildcard '*'
when the request's credentials mode is 'include'.
```

The dev fallback was `origin: '*'` with no `credentials`. **Fixed:** the fallback
now reflects the request origin with `credentials: true`, and production now
**fails closed** (throws) if `CORS_ORIGIN` is unset instead of serving a wildcard.

### Minor: misleading empty-state (found by adversarial review)
A cashier hitting a 403 saw "Create a category first" alongside the real
"Access Denied" banner — a permissions failure misreported as missing data.
Fixed by distinguishing *empty* from *failed*.

### Two self-inflicted issues, caught and fixed
- `CustomerModule` missing `AuthModule` → app failed to boot (`Nest can't
  resolve dependencies of the RbacPermissionGuard`). Caught on the first restart.
- Passing `categoriesApi.list` directly to `useQuery` would have made TanStack
  pass its context object as `includeDeleted`. Caught by `tsc`.

---

## Products module — what shipped

Replaces the read-only `AdminPanel` (298 lines, **zero** `useMutation`,
hardcoded `'tenant-uuid-1111'`).

- Full CRUD: list, filter by category, search, create, edit, availability
  toggle, archive (soft delete), archive view, restore.
- Tenant id now comes from the verified session, never a literal.
- Inline per-field validation mirroring the server DTOs.
- Server errors surfaced verbatim (NestJS `message` arrays joined), so a 409
  such as "cannot be deleted while it has 2 order(s) in progress" reaches the
  operator instead of a generic "Bad Request".
- Archive confirmation states explicitly that the action is reversible and that
  order history is preserved.

### Files added
```
apps/backoffice/src/app/lib/api-client.ts            (+ spec, 14 tests)
apps/backoffice/src/app/lib/resources.ts
apps/backoffice/src/app/lib/product-validation.ts    (+ spec, 16 tests)
apps/backoffice/src/app/components/ui/Primitives.tsx
apps/backoffice/src/app/components/modules/ProductsModule.tsx
apps/backoffice/src/app/components/BackofficeShell.tsx
apps/api/src/common/pipes/boolean-query.pipe.ts      (+ spec, 17 tests)
apps/api/src/customer/dto/update-customer-request.dto.ts
apps/api/src/customer/customer.crud.spec.ts          (28 tests)
packages/db/prisma/migrations/20260804010000_customer_crud_permissions/
```

### Files modified
```
apps/api/src/main.ts                              (DEFECT-K)
apps/api/src/common/csrf/csrf.guard.ts + module   (DEFECT-I)
apps/api/src/common/csrf/csrf.guard.spec.ts       (+7 DEFECT-I regressions)
apps/api/src/customer/{controller,service,module} (DEFECT-H)
apps/api/src/auth/casl-ability.factory.ts         (Customer subject)
apps/api/src/auth/guards/rbac-permission.guard.ts (Customer registry)
apps/api/src/{menu,branch,customer} services+controllers (includeDeleted)
apps/backoffice/src/app/page.tsx                  (shell + no hardcoded ids)
packages/db/prisma/seed.ts                        (customer CRUD permissions)
```

---

## Categories module — defects found and fixed

### DEFECT-L — category/branch creation was impossible from any UI ⚠️
`POST /menu/categories` and `POST /branches` both require a `restaurantId`, but
**no endpoint exposed one**. Runtime-proven:

```
GET  /api/v1/restaurants       -> HTTP 404  (route did not exist)
POST /api/v1/menu/categories   -> HTTP 400  ["restaurantId should not be empty"]
```

**Fixed:** added read-only `RestaurantController` (`GET /restaurants`,
`GET /restaurants/:id`) + service + module + permission migration. Writes remain
out of scope (AUDIT-008).

**Self-inflicted follow-up:** I first guarded it with the existing `Branch`
subject to avoid a new permission row. That was wrong — `RbacPermissionGuard`
re-resolves `:id` against the repository registered for the subject, so
`/restaurants/:id` searched the BRANCHES table and returned **404 for a valid
brand**. Caught in runtime verification; replaced with a dedicated `Restaurant`
subject + registry entry.

### DEFECT-M — three routes leaked HTTP 500 on a malformed `:id`
```
GET    /api/v1/tenants/NOT-A-UUID       -> 500  "Inconsistent column data: Error creating UUID"
DELETE /api/v1/webhooks/NOT-A-UUID      -> 500
DELETE /api/v1/device-tokens/NOT-A-UUID -> 500
```
`/orders/:id` and `/media/:id` were already safe (RBAC `UUID_PATTERN` check and
an explicit tenant guard). **Fixed** with `ParseUUIDPipe`; all three now 400.

### DEFECT-N — foreign `restaurantId` leaked a raw FK violation as 500
```
POST /api/v1/menu/categories { restaurantId: <foreign uuid> }
-> HTTP 500  "Foreign key constraint violated: categories_restaurantId_fkey"
```
Tenant isolation held (the insert failed), but the error handling leaked
database internals. **Fixed** in `createCategory` *and* `createBranch` (same
flaw, found by inspection while in the code path) — both now return a uniform
404 with no existence oracle.

## Categories module — what shipped

- Full CRUD: list, search, create, edit, hide/show, archive, archive view, restore.
- Rows ordered by `sortOrder` — the same order guests see.
- **Cascade warning is the key UX detail.** Archiving a category archives every
  product under it in one transaction. The dialog names the exact count
  ("*Appetizers* and its **2** product(s) will be archived together") and warns
  that restoring the category does **not** bring the products back. Verified
  against the database: archive → 2 products archived; restore → products stay
  archived; each must be restored individually.
- `restaurantId` is hidden on edit — re-parenting is rejected by the server
  (`property restaurantId should not exist`) and the UI does not offer it.

### Test-only corrections (my error, not the product's)
- The first cross-tenant adversarial result showed 401s — my harness tried to
  log in on `tokyoramen.localhost:3001`, which is not served. Re-driven through
  the API: all three verbs correctly return **404**.
- A SEARCH assertion expected exactly 1 row while leftovers from earlier runs
  matched the same prefix. Narrowed to a unique token.
- Five suites broke on `TenantRestaurantRepository is not a constructor` after
  the service gained that dependency — mock gaps, all fixed. Two further tests
  (`menu.service.spec`, `e2e.spec`) legitimately failed because they created a
  category without a restaurant fixture; the new guard is correct, so the
  fixtures were updated.

## Remaining Phase 2 work

| # | Module | Endpoints to wire | Notes |
|---|---|---|---|
| 3 | **Branches** | list / create / update / archive / restore | 409 when orders are in progress |
| 4 | **Tables** | list / create / update / archive / restore | `branchId` + `number` immutable (QR HMAC); show QR token |
| 5 | **Customers** | list / create / update / archive / restore | endpoints built this session, UI pending |
| 6 | **Staff users** | list / create / update / roles / branches / delete | AUDIT-004 endpoints already exist |

Then: remove `AdminPanel.tsx` and its spec once every tab is migrated (kept
temporarily so `/kds` keeps working), and a final full-app adversarial pass.

## Known environment notes
- After **any** `next build`, restart `next start` — stale `.next` chunks cause
  `ChunkLoadError` / HTTP 400 on assets and produce false E2E failures. Cost me
  two false alarms; both were tooling, not code.
- Access tokens expire in 15 minutes; long runtime sequences must re-authenticate.
- CSRF tokens are per-login. A stale token yields 403 on mutations — one of my
  early "soft delete is broken" readings was actually this.
