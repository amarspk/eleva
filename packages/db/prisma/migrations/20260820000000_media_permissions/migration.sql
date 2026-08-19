-- Media library RBAC.
--
-- MediaController declared no JwtAuthGuard (handlers read req.user?.tenantId
-- and 400 when absent — the route was effectively dead). AssetController
-- (the live Backoffice upload path) was JWT-only, so any authenticated
-- tenant role including CASHIER/KITCHEN_STAFF could mint presigned upload
-- URLs. Both surfaces now use JwtAuthGuard + RbacPermissionGuard with the
-- Media CASL subject (no tenantRepositoryRegistry entry — tenant scoping
-- stays in MediaService/AssetService via JWT tenantId, same as Payment).
--
-- Contract: RESTAURANT_OWNER and MANAGER get media create/read/update/delete.
-- CASHIER and KITCHEN_STAFF get none.
--
-- IDs: sha256("zayjar:permission:media:<action>") v4-shaped.

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('b005dd96-54ee-4311-a26a-62ca20f35820', 'create', 'media', 'Upload media assets', CURRENT_TIMESTAMP),
  ('82c64075-ec52-46e5-8b66-4471caf40afa', 'read',   'media', 'View media assets', CURRENT_TIMESTAMP),
  ('35885e3d-f0c2-4a3a-aada-164ef59a73cd', 'update', 'media', 'Optimize media assets', CURRENT_TIMESTAMP),
  ('21d7a846-1b80-405f-9d9c-6224e0485524', 'delete', 'media', 'Delete media assets', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'RESTAURANT_OWNER'
  AND p."resource" = 'media'
  AND p."action" IN ('create', 'read', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'media'
  AND p."action" IN ('create', 'read', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'PLATFORM_OWNER'
  AND p."resource" = 'media'
  AND p."action" IN ('create', 'read', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
