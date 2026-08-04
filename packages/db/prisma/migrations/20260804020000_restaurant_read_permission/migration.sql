-- AUDIT-014 DEFECT-L — restaurant brand read permission.
--
-- `POST /api/v1/menu/categories` and `POST /api/v1/branches` both require a
-- `restaurantId`, but no endpoint ever exposed one. Runtime-proven before the
-- fix:
--
--   GET  /api/v1/restaurants       -> HTTP 404   (no such route)
--   POST /api/v1/menu/categories   -> HTTP 400   ["restaurantId should not be empty"]
--
-- so the Backoffice could not create a category or a branch at all.
--
-- `GET /api/v1/restaurants` is now served by RestaurantController, guarded by a
-- dedicated `Restaurant` CASL subject. A dedicated subject is required rather
-- than reusing `Branch`, because `RbacPermissionGuard` re-resolves the `:id`
-- path parameter against the repository registered for that subject — a
-- Branch-guarded `/restaurants/:id` searched the BRANCHES table and returned
-- 404 for a valid restaurant (also runtime-proven).
--
-- Read-only scope: creating/deleting brands is AUDIT-008.
--
-- Every role that can already read branches or the menu is granted the brand
-- read, because both the category and branch creation forms need it.
-- Deterministic v4-shaped UUID from sha256("zayjar:permission:restaurant:read").

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES ('e639eecc-9662-4413-b0fa-7268801aca3f', 'read', 'restaurant', 'View restaurant brands', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('RESTAURANT_OWNER', 'MANAGER')
  AND p."resource" = 'restaurant'
  AND p."action" = 'read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
