-- AUDIT-010 — invoice retrieval/resend permissions (existing Invoice model).
-- Deterministic UUIDs from sha256("zayjar:permission:invoice:<act>") with
-- RFC-4122 version/variant nibble adjustment.

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('63925a50-623b-47d5-b2d2-97135cb19c89', 'read', 'invoice', 'View invoices', CURRENT_TIMESTAMP),
  ('9ad98f03-c7af-459c-82f9-41bbeb8c5a45', 'update', 'invoice', 'Resend invoices', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('RESTAURANT_OWNER', 'PLATFORM_OWNER')
  AND p."resource" = 'invoice'
  AND p."action" IN ('read', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'invoice'
  AND p."action" IN ('read', 'update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
