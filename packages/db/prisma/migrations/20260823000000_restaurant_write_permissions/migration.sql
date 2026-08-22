-- AUDIT-008 — restaurant brand write permissions.
--
-- Seed previously granted only restaurant:read (AUDIT-014 DEFECT-L).
-- Write routes use the existing CASL vocabulary (create/update/delete +
-- restaurant) — same pattern as AUDIT-006/007.
--
-- Deterministic v4-shaped UUIDs from sha256("zayjar:permission:restaurant:<act>")
-- with RFC-4122 version/variant nibble adjustment (same recipe as restaurant:read).

INSERT INTO "permissions" ("id", "action", "resource", "description", "createdAt")
VALUES
  ('8b0a0a8f-d547-445c-a490-19e80a3c2140', 'create', 'restaurant', 'Create restaurant brands', CURRENT_TIMESTAMP),
  ('8a069985-e595-4d35-8d79-5ebf83542603', 'update', 'restaurant', 'Update restaurant brands', CURRENT_TIMESTAMP),
  ('c3074e8c-e8c3-4650-9fde-b1f2d828e3f8', 'delete', 'restaurant', 'Delete restaurant brands', CURRENT_TIMESTAMP)
ON CONFLICT ("action", "resource") DO NOTHING;

-- Owners receive every restaurant write (same as "owner gets everything").
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('RESTAURANT_OWNER', 'PLATFORM_OWNER')
  AND p."resource" = 'restaurant'
  AND p."action" IN ('create', 'update', 'delete')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Managers may update brand settings (name/currency/tax) but not create/delete
-- additional brands — those are gated by SubscriptionPlan.maxRestaurants.
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'MANAGER'
  AND p."resource" = 'restaurant'
  AND p."action" = 'update'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
