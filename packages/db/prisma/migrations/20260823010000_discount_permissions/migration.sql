-- AUDIT-009 — discount management permissions (existing Discount model).
-- Deterministic UUIDs from sha256("zayjar:permission:discount:<act>") with
-- RFC-4122 version/variant nibble adjustment.

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('240ee971-0299-4a3e-960a-53c50426f5d7', 'read', 'discount', 'View discount codes', CURRENT_TIMESTAMP),
  ('4fa165bc-d656-49d7-8b91-e98c266c1fe3', 'create', 'discount', 'Create discount codes', CURRENT_TIMESTAMP),
  ('ad5d6460-5701-4594-8998-9de09fb072d6', 'update', 'discount', 'Update discount codes', CURRENT_TIMESTAMP),
  ('2d3a2e90-b039-4e0f-a7b8-997f4a4f0f20', 'delete', 'discount', 'Delete discount codes', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('RESTAURANT_OWNER', 'PLATFORM_OWNER')
  AND p."resource" = 'discount'
  AND p."action" IN ('read', 'create', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'discount'
  AND p."action" IN ('read', 'create', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
