-- AUDIT-014 (Frontend Completion) — Customer management permissions.
--
-- SECURITY CONTEXT (DEFECT-H): `CustomerController` shipped with NO
-- `@UseGuards` decorator, and the application registers no global auth guard
-- (only `CsrfGuard` is an APP_GUARD). Runtime-proven before the fix:
--
--   curl http://albaik.localhost:8000/api/v1/customers      # no Authorization
--   -> HTTP 200
--   [{"id":"...","firstName":"Noura","lastName":"Saeed",
--     "email":"noura.saeed@email.com","loyaltyPoints":75, ...}, ...]
--
-- i.e. the tenant's entire customer PII table was world-readable. The
-- controller is now guarded with JwtAuthGuard + RbacPermissionGuard and each
-- route carries `@RequirePermission(<action>, 'Customer')`.
--
-- `Customer` is a NEW CASL subject (added to CaslAbilityFactory's Subjects
-- union and to the RBAC guard's tenant repository registry). The existing seed
-- rows for this resource use the legacy vocabulary the CASL factory never
-- matches (`customer:read` exists, but `customer:write` is not a CASL action),
-- so `update`/`delete`/`create` rows are required for the guard to grant
-- anything. `customer:read` is inserted defensively with ON CONFLICT DO NOTHING
-- because the legacy seed already provides it.
--
-- IDs are deterministic v4-shaped UUIDs from
-- sha256("zayjar:permission:<resource>:<action>") — same convention as the
-- AUDIT-004 user:* and AUDIT-006/007 rows.

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('6e2ec72c-929c-4534-b837-0d414499499d', 'read',   'customer', 'View customers',   CURRENT_TIMESTAMP),
  ('5c801e6a-9dd4-4efa-a259-1a5dda2a0dc4', 'create', 'customer', 'Create customers', CURRENT_TIMESTAMP),
  ('b2f0df84-5159-4e76-9aa9-32633d49ba7f', 'update', 'customer', 'Update customers', CURRENT_TIMESTAMP),
  ('e388594d-c749-480a-9045-514e01197bc3', 'delete', 'customer', 'Delete customers', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- Owner gets everything (seed convention). Matched by (action, resource) so the
-- link is created even when an equivalent row pre-exists under another id.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'RESTAURANT_OWNER'
  AND p."resource" = 'customer'
  AND p."action" IN ('read', 'create', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Managers already hold the legacy `customer:read`/`customer:write` pair, which
-- reflects the intent that they administer customers. Grant them the CASL
-- vocabulary equivalents so that intent actually takes effect. Cashiers and
-- kitchen staff are deliberately NOT granted update/delete.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'customer'
  AND p."action" IN ('read', 'create', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Cashiers need to look customers up at the till and register new ones.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'CASHIER'
  AND p."resource" = 'customer'
  AND p."action" IN ('read', 'create')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
