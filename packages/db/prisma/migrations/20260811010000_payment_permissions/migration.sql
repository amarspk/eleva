-- AUDIT-002 Finding #5 (RBAC) — payment wallet permissions.
--
-- SECURITY CONTEXT: PaymentController shipped with JwtAuthGuard only; the two
-- wallet endpoints (POST /api/v1/payments/wallet and
-- GET /api/v1/payments/wallet/:paymentId/verify) had NO role/permission
-- authorization, so any authenticated tenant role — including KITCHEN_STAFF —
-- could initiate real payment sessions and read payment status. The controller
-- is now guarded with JwtAuthGuard + RbacPermissionGuard and each wallet route
-- carries @RequirePermission(<action>, 'Payment'). The Tap webhook route
-- remains @Public() + hashstring-verified (unchanged).
--
-- `Payment` is a NEW CASL subject (added to CaslAbilityFactory's Subjects
-- union). Route params are `:paymentId`, not `:id`, so the RBAC guard's entity
-- re-resolution is intentionally skipped and tenant authorization stays in
-- WalletService via dbTenantContext — no tenantRepositoryRegistry entry is
-- required.
--
-- Contract: RESTAURANT_OWNER, MANAGER and CASHIER get payment:create +
-- payment:read; KITCHEN_STAFF gets neither.
--
-- IDs are deterministic v4-shaped UUIDs from
-- sha256("zayjar:permission:payment:create") / sha256("zayjar:permission:payment:read")
-- — same convention as the AUDIT-014 customer rows.

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('328a0aa5-0576-4750-87bb-01ba2c283f74', 'create', 'payment', 'Create wallet payments', CURRENT_TIMESTAMP),
  ('fec355e8-c91f-45b6-83b7-fbb957c180ae', 'read',   'payment', 'View wallet payments',   CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- Owner gets everything (seed convention). Matched by (action, resource) so the
-- link is created even when an equivalent row pre-exists under another id.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'RESTAURANT_OWNER'
  AND p."resource" = 'payment'
  AND p."action" IN ('create', 'read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Managers process orders/payments.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'payment'
  AND p."action" IN ('create', 'read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Cashiers process payments at the till (seed role description: "Can process
-- orders and payments").
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'CASHIER'
  AND p."resource" = 'payment'
  AND p."action" IN ('create', 'read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- KITCHEN_STAFF deliberately NOT granted either payment permission.
