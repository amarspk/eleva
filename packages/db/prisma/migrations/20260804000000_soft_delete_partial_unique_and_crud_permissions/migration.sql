-- AUDIT-006 / AUDIT-007 — CRUD (update + soft-delete + restore) for
-- Products, Categories, Branches and Tables.
--
-- This migration fixes two prerequisites that block the feature. Both were
-- reproduced at runtime before being changed (see CTO_AUDIT_EVIDENCE.md).
--
-- =====================================================================
-- PART 1 — Partial unique indexes (DOC-002 §2.8 + §602)
-- =====================================================================
-- DOC-002 specifies these uniqueness scopes as PARTIAL indexes that ignore
-- soft-deleted rows:
--   §28  idx_tenants_subdomain      ... WHERE deleted_at IS NULL
--   §29  idx_tenants_custom_domain  ... WHERE custom_domain IS NOT NULL AND deleted_at IS NULL
--   §114 idx_users_email_tenant     ... WHERE deleted_at IS NULL
--   §234 idx_tables_qr_token        ... WHERE deleted_at IS NULL
--   §448 idx_customers_email_tenant ... WHERE deleted_at IS NULL
--   §602 "Tenant uniqueness bounds are enforced using partial indexes that
--         ignore soft-deleted records (e.g., WHERE deleted_at IS NULL)."
--
-- The 20250101000000_init migration created them as FULL unique indexes, so a
-- soft-deleted row keeps occupying its unique slot forever. Runtime-proven
-- before this fix:
--
--   UPDATE tables SET "deletedAt"=now() WHERE number='RT-91';
--   INSERT INTO tables (... same branch/number ...);
--   -> ERROR: duplicate key value violates unique constraint "idx_tables_qr_token"
--
--   UPDATE users SET "deletedAt"=now() WHERE email='cashier@albaik.com';
--   INSERT INTO users (... same email/tenant ...);
--   -> ERROR: duplicate key value violates unique constraint "idx_users_email_tenant"
--
-- Because the table QR token is a deterministic HMAC of
-- `tenantId:branchId:tableNumber` (branch.service.ts), soft-deleting table "12"
-- permanently burns the number "12" for that branch: the operator can never
-- recreate it. That turns the soft delete AUDIT-007 introduces into an
-- irreversible data-loss trap, so it must be corrected in the same change.
--
-- Index names are preserved so no application code or Prisma mapping changes.
-- Prisma's schema language cannot express partial indexes; the `@@unique`
-- attributes in schema.prisma remain the closest representable form and are
-- annotated there pointing at this migration.

-- tables.qrCodeToken
DROP INDEX IF EXISTS "idx_tables_qr_token";
CREATE UNIQUE INDEX "idx_tables_qr_token"
  ON "tables"("qrCodeToken")
  WHERE "deletedAt" IS NULL;

-- users(email, tenantId)
DROP INDEX IF EXISTS "idx_users_email_tenant";
CREATE UNIQUE INDEX "idx_users_email_tenant"
  ON "users"("email", "tenantId")
  WHERE "deletedAt" IS NULL;

-- customers(email, tenantId)
DROP INDEX IF EXISTS "idx_customers_email_tenant";
CREATE UNIQUE INDEX "idx_customers_email_tenant"
  ON "customers"("email", "tenantId")
  WHERE "deletedAt" IS NULL;

-- tenants.subdomain
DROP INDEX IF EXISTS "idx_tenants_subdomain";
CREATE UNIQUE INDEX "idx_tenants_subdomain"
  ON "tenants"("subdomain")
  WHERE "deletedAt" IS NULL;

-- tenants.customDomain
DROP INDEX IF EXISTS "idx_tenants_custom_domain";
CREATE UNIQUE INDEX "idx_tenants_custom_domain"
  ON "tenants"("customDomain")
  WHERE "customDomain" IS NOT NULL AND "deletedAt" IS NULL;


-- =====================================================================
-- PART 2 — RBAC permission rows for the new mutating routes
-- =====================================================================
-- `CaslAbilityFactory` builds abilities from `"<resource>:<action>"` strings on
-- the JWT and PascalCases the resource (`product` -> `Product`). Runtime-proven
-- before this fix, a seeded RESTAURANT_OWNER token carried:
--
--   branch:create branch:read branch:write product:create product:read
--   table:create table:read order:* user:* tenant:* ...
--
-- i.e. NO `*:update` / `*:delete` for product/branch/table and NO `category:*`
-- at all. Adding the endpoints without these rows would return 403 for every
-- caller, including the owner.
--
-- IDs are deterministic v4-shaped UUIDs derived from
-- sha256("zayjar:permission:<resource>:<action>") — the same convention used by
-- the AUDIT-004 user:* rows — so they are reproducible across clean databases
-- and idempotent here.
--
-- Grants follow the AUDIT-004 precedent: the RESTAURANT_OWNER role is linked to
-- every permission row. MANAGER/CASHIER/KITCHEN_STAFF grants are intentionally
-- NOT widened here — broadening staff menu-management rights is a product
-- decision, not an engineering one.

-- NOTE: `permissions` also carries a UNIQUE index on (action, resource)
-- (idx_permissions_action_resource), so the conflict target below is that pair
-- rather than the primary key — re-running against a database where the seed
-- already created an equivalent row must not fail.
INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('c113bd81-a04c-43a2-8b6a-800b7acb6d25', 'update', 'product',  'Update products',   CURRENT_TIMESTAMP),
  ('909d7781-0273-4eac-8d0f-dde089545e5e', 'delete', 'product',  'Delete products',   CURRENT_TIMESTAMP),
  ('d5e00a2a-a884-4ad6-977f-7a7c3d08ce80', 'read',   'category', 'View categories',   CURRENT_TIMESTAMP),
  ('91333552-edb4-4eba-8102-22e25b392064', 'create', 'category', 'Create categories', CURRENT_TIMESTAMP),
  ('b4a79425-a0a9-419a-8e1f-57305ec8c30a', 'update', 'category', 'Update categories', CURRENT_TIMESTAMP),
  ('e4678b9a-d826-4455-a185-cf5a14fcbfd1', 'delete', 'category', 'Delete categories', CURRENT_TIMESTAMP),
  ('b3dfa635-ecff-4139-9a2a-4b36fac46f9a', 'update', 'branch',   'Update branches',   CURRENT_TIMESTAMP),
  ('b1a69822-1664-4b09-804d-7dcac002c950', 'delete', 'branch',   'Delete branches',   CURRENT_TIMESTAMP),
  ('ee2b6baa-999c-4d97-9371-062c40bd6d77', 'update', 'table',    'Update tables',     CURRENT_TIMESTAMP),
  ('f3d92895-1ac2-470d-a472-7ed904f27b36', 'delete', 'table',    'Delete tables',     CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- Link every new permission to each existing RESTAURANT_OWNER role (the seed's
-- "Owner gets everything" rule), for every tenant already provisioned.
-- Matched by (action, resource) rather than id so the link is created even if
-- an equivalent row already existed under a different id.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'RESTAURANT_OWNER'
  AND (
    (p."resource" = 'product'  AND p."action" IN ('update', 'delete')) OR
    (p."resource" = 'branch'   AND p."action" IN ('update', 'delete')) OR
    (p."resource" = 'table'    AND p."action" IN ('update', 'delete')) OR
    (p."resource" = 'category' AND p."action" IN ('read', 'create', 'update', 'delete'))
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
