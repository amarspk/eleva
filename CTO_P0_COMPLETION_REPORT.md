# Zayjar Platform — P0 Completion & Production Readiness Report

**Date:** 2026-08-04
**Author:** CTO / Lead Backend Engineer
**Scope:** Closure of AUDIT-006 / AUDIT-007, final P0 status, remaining P1/P2 backlog
**Constraints honoured:** No `PROJECT_STATE.md` edit (sha256 verified unchanged: `c2618f6d…d51a`) · No commits · No pushes

---

## 1. Headline

**P0 is 100% complete.** All three launch blockers (AUDIT-001, AUDIT-002, AUDIT-006/007) are implemented, verified at runtime, attacked, and re-verified.

Closing AUDIT-006/007 required fixing **seven** defects, not the two originally scoped. Five were discovered *by* the verification and adversarial cycles, and two of those were defects in my own new code — caught before delivery, not after.

| Verification gate | Result |
|---|---|
| TypeScript (`types` / `db` / `api`) | **0 / 0 / 0 errors** |
| ESLint | **6 / 6 workspaces clean** |
| Unit + integration tests | **717 passed, 2 skipped, 0 failed** (baseline 646 → **+71**) |
| Build (`turbo run build`) | **6 / 6 successful** |
| Runtime verification | 12 new endpoints exercised live against PostgreSQL + Redis |
| Adversarial review | 10 attack classes, all repelled |

---

## 2. AUDIT-006 / AUDIT-007 — what was actually wrong

Every defect below was **reproduced at runtime before any code was changed**.

### DEFECT-A / DEFECT-B — no update or delete surface (the original scope)
With a valid `RESTAURANT_OWNER` token against existing rows:

```
PUT    /api/v1/menu/products/{id}    -> 404
PUT    /api/v1/menu/categories/{id}  -> 404
PUT    /api/v1/branches/{id}         -> 404
PUT    /api/v1/tables/{id}           -> 404
DELETE (same four)                   -> 404
```
The entire API had only 10 mutating routes; none touched the menu or the floor plan. A restaurant could create a product but never fix its price, and never remove it.

### DEFECT-C — the permission vocabulary did not exist
The seeded owner's JWT carried **no `*:update` / `*:delete` for product, branch or table, and no `category:*` at all**:

```
branch:create branch:read branch:write product:create product:read
table:create table:read order:* user:* tenant:* ...
```
`Category` was also absent from the CASL `Subjects` union *and* from the RBAC guard's repository registry. Shipping the endpoints without this would have returned **403 to every caller including the owner** — the feature would have been dead on arrival.

### DEFECT-D — soft delete was a one-way data-loss trap (pre-existing, spec violation)
`DOC-002 §234/§602` require the uniqueness scopes to be **partial** indexes ignoring soft-deleted rows. The `init` migration created them as **full** unique indexes. Proven in SQL:

```
UPDATE tables SET "deletedAt"=now() WHERE number='RT-91';
INSERT INTO tables (...same branch/number...);
ERROR: duplicate key value violates unique constraint "idx_tables_qr_token"
```
Because the QR token is a deterministic HMAC of `tenantId:branchId:number`, **soft-deleting table "12" permanently burned the number "12" for that branch.** The same trap existed on `users(email,tenantId)` — already reachable via the AUDIT-004 user soft-delete shipped last session — plus `customers`, `tenants.subdomain` and `tenants.customDomain`.

### DEFECT-E — restore endpoints were unreachable *(defect in my own new code)*
The RBAC guard re-resolves `:id` via `findById`, which filters `deletedAt IS NULL`. Restore targets are *by definition* the rows that filter hides, so the guard returned 404 before the handler ever ran:

```
POST /api/v1/menu/products/{id}/restore -> 404   (row present in Postgres with deletedAt set)
```

### DEFECT-F — the cascade violated the tenant-isolation extension *(defect in my own new code)*
My first cascade used `updateMany`, which the tenant-scoped Prisma extension deliberately blocks:

```
DELETE /api/v1/menu/categories/{id} -> 500
"Fail-Safe Block: Operation 'updateMany' is unsupported on scoped model 'Product'"
```

### DEFECT-G — soft-deleted tables were still orderable *(found by adversarial review)*
The most serious finding. `createOrder` validated `branchId` and every `productId`, but wrote the client's **`tableId` straight onto the order with no lookup at all**:

| Checkout attempt | Before | After |
|---|---|---|
| Soft-deleted table | **201 Created** | **404** |
| Table from a *different* branch | **201 Created** | **400** |
| Cross-tenant table | **201 Created** | **404** |

This defeated the new `DELETE /tables/:id` entirely — "removing" a table from service left it fully orderable. Note this was a **pre-existing hole in the order pipeline** that only became visible once delete semantics existed to test against.

---

## 3. What was delivered

### 12 new endpoints
```
PUT    /api/v1/menu/products/:id            DELETE /api/v1/menu/products/:id
POST   /api/v1/menu/products/:id/restore
PUT    /api/v1/menu/categories/:id          DELETE /api/v1/menu/categories/:id
POST   /api/v1/menu/categories/:id/restore
PUT    /api/v1/branches/:id                 DELETE /api/v1/branches/:id
POST   /api/v1/branches/:id/restore
PUT    /api/v1/tables/:id                   DELETE /api/v1/tables/:id
POST   /api/v1/tables/:id/restore
```

### Semantics implemented (per your instruction)
- **DELETE = soft delete only.** Sets `deletedAt`; **no hard-delete endpoint exists anywhere.**
- **Order history preserved.** Runtime-proven: deleting a product with sales history keeps `order_items` intact and the historical join still resolves the product name.
- **All reads hide deleted records automatically** — staff list reads, filtered reads, single-record reads, the public guest menu, and QR token resolution.
- **Restore endpoints added** (`POST …/:id/restore`), guarded by the `update` action so no new permission string was needed on existing roles.

### Deliberate design decisions (flagged for your judgment)
| Decision | Rationale |
|---|---|
| Deleting a **category cascades to its products**; deleting a **branch cascades to its tables** — atomically | A live product under a deleted category is unreachable from the menu tree yet still orderable. A live table under a deleted branch still resolves its QR code. |
| **Restore does *not* cascade** | Children may have been deleted deliberately *before* the parent. Restoring the parent then each child is explicit and lossless; the reverse is not. |
| Delete refused (**409**) while orders are in progress | Closing a branch or table with food in the kitchen would strand those orders behind a hidden record. |
| `restaurantId`, table `branchId` and table `number` are **immutable** | Re-parenting silently moves children and rewrites reporting hierarchy; `branchId`+`number` feed the printed QR HMAC, so changing them invalidates physical stickers. |
| Staff roles (`MANAGER`/`CASHIER`/`KITCHEN_STAFF`) were **not** granted the new rights | Widening staff menu-management authority is a **product decision, not an engineering one**. Currently owner-only. **This is the one item I recommend you explicitly rule on.** |

---

## 4. Adversarial review — 10 attack classes, all repelled

| # | Attack | Result |
|---|---|---|
| 1 | Cross-tenant PUT/DELETE/RESTORE on all 4 resources (12 probes) | **404** on every one; target rows verified untouched |
| 2 | RBAC bypass — cashier / kitchen / manager attempting menu + branch mutations | **403** on all 9 probes |
| 3 | Anonymous access to PUT / DELETE / RESTORE | **401** |
| 4 | Malformed input: non-UUID id, SQL injection in path, negative price, string price, 300-char name, invalid enum, out-of-range latitude | **400 / 404 — zero 500s** |
| 5 | Field smuggling: `tenantId`, `deletedAt`, `id`, immutable `branchId` / `number` in body | **400** (`forbidNonWhitelisted`) |
| 6 | Order-history destruction via delete | History intact; `order_items` preserved; joins still resolve |
| 7 | Concurrency: 5 simultaneous DELETEs, 4 simultaneous cascade DELETEs, DELETE/RESTORE interleave | One 200 + rest 404; **1 tombstone, 0 orphans**; tombstone never rewritten |
| 8 | Guest menu leakage of deleted products | Hidden immediately; reappears only on restore |
| 9 | Deleted table / branch QR still resolving | **404** for both |
| 10 | Ordering against deleted table / branch / product | **404 / 400** (this is DEFECT-G, found and fixed here) |

---

## 5. Files changed

**New (10):**
`apps/api/src/menu/dto/update-product-request.dto.ts` · `update-category-request.dto.ts` · `apps/api/src/branch/dto/update-branch-request.dto.ts` · `update-table-request.dto.ts` · `apps/api/src/auth/decorators/include-soft-deleted.decorator.ts` · `apps/api/src/menu/menu.crud.spec.ts` (24 tests) · `apps/api/src/branch/branch.crud.spec.ts` (28 tests) · `apps/api/src/auth/soft-delete-authorization.spec.ts` (7 tests) · `apps/api/src/common/soft-delete-repository.spec.ts` (9 tests) · `packages/db/prisma/migrations/20260804000000_soft_delete_partial_unique_and_crud_permissions/migration.sql`

**Modified (9):**
`menu.controller.ts` · `menu.service.ts` · `branch.controller.ts` · `branch.service.ts` · `order.service.ts` (DEFECT-G) · `casl-ability.factory.ts` · `rbac-permission.guard.ts` · `packages/db/src/repositories/BaseTenantRepository.ts` · `packages/db/prisma/seed.ts`

**Test fixtures corrected (2):** `order.checkout.integration.spec.ts`, `order.service.spec.ts` — three guest-checkout tests began failing because `createOrder` now validates `tableId`; these were **fixture gaps (unmocked lookup reaching real Prisma), not behavioural regressions**, and the new validation is correct defense-in-depth.

---

## 6. Migration note (deployment-relevant)

`20260804000000_…` performs two things and is **idempotent**:
1. Rebuilds 5 unique indexes as **partial** (`WHERE deleted_at IS NULL`) per DOC-002 — index names preserved, so no application or Prisma mapping changes.
2. Inserts 10 permission rows and links them to every existing `RESTAURANT_OWNER` role.

⚠️ **Two operational cautions:**
- Index rebuilds take a brief exclusive lock. On a large `users`/`tenants` table, run during a maintenance window or convert to `CREATE INDEX CONCURRENTLY` in a separate transaction-less migration.
- Prisma's schema language **cannot express partial indexes**, so `schema.prisma` still shows plain `@@unique`. A future `prisma migrate dev` could try to "correct" the database back to full indexes. This is a known Prisma limitation and is annotated in the migration; it needs a guard in CI (see P1 below).

---

## 7. Remaining non-blocking work

### P1 — should precede or accompany general availability
| ID | Item | Why it matters |
|---|---|---|
| **AUDIT-005** | No password reset / email verification. `sendPasswordResetEmail` exists but is never called; no schema token fields | Any locked-out operator needs manual DB intervention |
| **AUDIT-020** | **No Helmet** — app-level security headers absent (nginx.conf has 14, but the app is unprotected if reached directly) | Cheap, high-value hardening |
| **AUDIT-012** | E2E tests fully API-mocked and excluded from CI; the `test` job has no database service | Nothing would have caught DEFECT-G in CI |
| **AUDIT-011** | No OpenAPI/Swagger; ~21 of 70 routes undocumented (now more, with the 12 added here) | Frontend/integration friction |
| **AUDIT-023** | No `/metrics`, no readiness/liveness split (`health.controller.ts` returns a static literal) | Cannot run a safe rolling deploy |
| **AUDIT-014** | Restaurant dashboard read-only — `AdminPanel.tsx` has zero `useMutation` and hardcoded `'tenant-uuid-1111'` | **The 12 endpoints delivered today have no UI consuming them yet** |
| **new** | CI guard asserting the 5 partial indexes are not reverted by a Prisma migration | Protects the DEFECT-D fix |
| **new** | Product decision + implementation for staff-role menu permissions | Currently owner-only (see §3) |

### P2 — post-launch
AUDIT-008 (no restaurant module) · AUDIT-009 (discounts seed-only, no management API) · AUDIT-010 (invoices generated, no retrieval endpoint) · AUDIT-013 (`customDomain` with no DNS verification) · AUDIT-015 (platform dashboard = 1 endpoint, no UI) · AUDIT-017 (no subscription cancel/upgrade/downgrade/portal) · AUDIT-021 (Unifonic SMS mocked even when configured) · AUDIT-022 (no notification inbox API) · AUDIT-024 (0 tests in `packages/db` — partially mitigated today by `soft-delete-repository.spec.ts` exercising the real base class) · AUDIT-025 (M4 order partitioning parked; needs an architecture RFC)

**Reclassified, not defects:** AUDIT-003 downgraded Critical→Low. **Website Builder** and **Platform Dashboard UI** are absent from *every* spec document — they are unbuilt features requiring a product decision, not engineering defects.

---

## 8. Recommended next phase

**Phase 1 — "Make it operable" (recommended immediately):**
1. **AUDIT-014 — wire the backoffice UI to the 12 new endpoints.** The API can now manage a menu and floor plan; no human-usable surface exists for it. This converts today's work into actual customer value and is the single highest-leverage item.
2. **AUDIT-005 — password reset.** Currently the top predictable support-ticket generator.
3. **AUDIT-020 — Helmet.** Hours of work.
4. **AUDIT-012 — a real integration-test job with a Postgres service.** DEFECT-G was a 201-instead-of-404 on a core money path that only live testing exposed; CI must be able to catch that class of bug.

Then AUDIT-023 (observability) and AUDIT-011 (OpenAPI) before opening the platform to third parties.

---

## 9. Honest statement of completion

I have implemented, verified, attacked, and re-verified AUDIT-006 and AUDIT-007. I cannot find any remaining engineering defects in this work.

Two caveats I will not paper over:
- **The delivered endpoints have no UI** (AUDIT-014). P0 as defined was API completeness, and that is met — but no restaurant operator can use these features from a browser today.
- **Staff-role permissions for the new operations are an open product question**, deliberately left owner-only rather than decided unilaterally.
