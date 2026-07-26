-- ==============================================================================
-- DOC-010 §9.2 — EXPLAIN ANALYZE Query Profiling Scripts
-- ==============================================================================
-- Run these queries against a STAGING or COPY of the production database.
-- NEVER run EXPLAIN ANALYZE on production during peak traffic.
--
-- Usage:
--   psql "$DATABASE_URL" -f packages/db/scripts/query-profiling.sql
--
-- Each query is wrapped with EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) to show
-- actual execution plans, row estimates, and buffer usage.
-- ==============================================================================

\echo '============================================================='
\echo ' DOC-010 §9.2 — Hot-Path Query Profiling'
\echo '============================================================='
\echo ''

-- ------------------------------------------------------------------
-- 1. Menu Fetch: Categories + Products by Restaurant (QR menu view)
--    This is the highest-read query in the system: every QR scan loads
--    the full menu for a restaurant branch.
-- ------------------------------------------------------------------
\echo '--- [1] Menu fetch: categories + products by restaurant ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT c.id, c.name, c."sortOrder",
       p.id, p.name, p.description, p."imageUrl", p."basePrice",
       p."isAvailable", p.calories, p."preparationTime"
FROM "Category" c
LEFT JOIN "Product" p ON p."categoryId" = c.id
WHERE c."restaurantId" = '00000000-0000-0000-0000-000000000001'
  AND c."isActive" = true
  AND c."deletedAt" IS NULL
ORDER BY c."sortOrder", p.name;

-- ------------------------------------------------------------------
-- 2. Product with sizes, variants, and addons (detail view)
--    Fetches full product configuration including all variants.
-- ------------------------------------------------------------------
\echo '--- [2] Product detail with sizes, variants, addons ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT p.id, p.name, p."basePrice",
       json_agg(DISTINCT jsonb_build_object('id', ps.id, 'name', ps.name, 'adjustment', ps."priceAdjustment")) AS sizes,
       json_agg(DISTINCT jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'stock', pv."stockQuantity")) AS variants,
       json_agg(DISTINCT jsonb_build_object('id', pa.id, 'name', pa.name, 'min', pa."minSelections", 'max', pa."maxSelections")) AS addons
FROM "Product" p
LEFT JOIN "ProductSize" ps ON ps."productId" = p.id
LEFT JOIN "ProductVariant" pv ON pv."productId" = p.id
LEFT JOIN "ProductAddon" pa ON pa."productId" = p.id
WHERE p.id = '00000000-0000-0000-0000-000000000001'
GROUP BY p.id;

-- ------------------------------------------------------------------
-- 3. Orders listing: tenant + branch filter (backoffice order board)
--    Core query for the order management dashboard.
-- ------------------------------------------------------------------
\echo '--- [3] Orders listing by tenant + branch ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o."orderNumber", o.type, o.status, o.total, o."createdAt",
       o."customerId", o."tableId"
FROM "Order" o
WHERE o."tenantId" = '00000000-0000-0000-0000-000000000001'
  AND o."branchId" = '00000000-0000-0000-0000-000000000002'
ORDER BY o."createdAt" DESC
LIMIT 50;

-- ------------------------------------------------------------------
-- 4. Active orders for KDS (kitchen display system)
--    Must be fast — chefs see this in real time.
-- ------------------------------------------------------------------
\echo '--- [4] Active orders for KDS ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o."orderNumber", o.type, o.status, o."createdAt",
       oi.id AS "itemId", oi.quantity, oi."cookingStatus",
       p.name AS "productName"
FROM "Order" o
JOIN "OrderItem" oi ON oi."orderId" = o.id
JOIN "Product" p ON p.id = oi."productId"
WHERE o."tenantId" = '00000000-0000-0000-0000-000000000001'
  AND o."branchId" = '00000000-0000-0000-0000-000000000002'
  AND o.status IN ('PENDING', 'ACCEPTED', 'PREPARING')
  AND o."deletedAt" IS NULL
ORDER BY o."createdAt" ASC;

-- ------------------------------------------------------------------
-- 5. Kitchen queue lookup (active tickets)
-- ------------------------------------------------------------------
\echo '--- [5] Kitchen queue active tickets ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT kq.id, kq."ticketNumber", kq.priority, kq."startedCookingAt",
       o.id AS "orderId", o."orderNumber", o.type, o.status
FROM "KitchenQueue" kq
JOIN "Order" o ON o.id = kq."orderId"
WHERE kq."branchId" = '00000000-0000-0000-0000-000000000002'
  AND o.status IN ('PENDING', 'ACCEPTED', 'PREPARING')
ORDER BY kq.priority, kq."startedCookingAt";

-- ------------------------------------------------------------------
-- 6. Customer lookup by email (login / loyalty)
-- ------------------------------------------------------------------
\echo '--- [6] Customer lookup by email + tenant ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT c.id, c."firstName", c."lastName", c.email, c."phoneNumber",
       c."loyaltyPoints"
FROM "Customer" c
WHERE c.email = 'customer@example.com'
  AND c."tenantId" = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------
-- 7. Order with items + payments (receipt / invoice view)
-- ------------------------------------------------------------------
\echo '--- [7] Order detail with items + payments ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.id, o."orderNumber", o.type, o.status, o.subtotal, o."taxAmount",
       o."discountAmount", o."tipAmount", o.total, o."specialNotes",
       json_agg(DISTINCT jsonb_build_object(
         'id', oi.id, 'name', p.name, 'qty', oi.quantity,
         'unitPrice', oi."unitPrice", 'totalPrice', oi."totalPrice",
         'cookingStatus', oi."cookingStatus"
       )) AS items,
       json_agg(DISTINCT jsonb_build_object(
         'id', pay.id, 'method', pay."paymentMethod", 'status', pay.status,
         'amount', pay.amount
       )) AS payments
FROM "Order" o
LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
LEFT JOIN "Product" p ON p.id = oi."productId"
LEFT JOIN "Payment" pay ON pay."orderId" = o.id
WHERE o.id = '00000000-0000-0000-0000-000000000001'
GROUP BY o.id;

-- ------------------------------------------------------------------
-- 8. Session log validation (auth refresh token check)
--    Called on every refresh token rotation.
-- ------------------------------------------------------------------
\echo '--- [8] Session log lookup for refresh token ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT sl.id, sl."refreshTokenHash", sl."expiresAt", sl."isRevoked",
       u.id AS "userId", u.email, u."isActive"
FROM "SessionLog" sl
JOIN "User" u ON u.id = sl."userId"
WHERE sl."refreshTokenHash" = 'abcdef1234567890'
  AND sl."isRevoked" = false;

-- ------------------------------------------------------------------
-- 9. Audit log query (backoffice audit trail)
--    Pagination query on the audit_logs table.
-- ------------------------------------------------------------------
\echo '--- [9] Audit log query with tenant + user filter ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT al.id, al.action, al."entityName", al."entityId",
       al."oldValues", al."newValues", al."ipAddress", al."createdAt"
FROM "AuditLog" al
WHERE al."tenantId" = '00000000-0000-0000-0000-000000000001'
  AND al."userId" = '00000000-0000-0000-0000-000000000003'
ORDER BY al."createdAt" DESC
LIMIT 25;

-- ------------------------------------------------------------------
-- 10. Table status lookup (QR menu: is my table occupied?)
-- ------------------------------------------------------------------
\echo '--- [10] Table lookup by QR token ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT t.id, t.number, t.status, t."seatingCapacity",
       b.name AS "branchName", r.name AS "restaurantName"
FROM "Table" t
JOIN "Branch" b ON b.id = t."branchId"
JOIN "Restaurant" r ON r.id = b."restaurantId"
WHERE t."qrCodeToken" = 'sample-qr-token-12345';

-- ------------------------------------------------------------------
-- 11. Subscription check (middleware auth gate)
--    Called on every authenticated request to verify tenant status.
-- ------------------------------------------------------------------
\echo '--- [11] Subscription status by tenant ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.status, s."currentPeriodEnd", s."cancelAtPeriodEnd",
       sp.name AS "planName", sp."maxBranches", sp."maxProductsPerBranch"
FROM "Subscription" s
JOIN "SubscriptionPlan" sp ON sp.id = s."planId"
WHERE s."tenantId" = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------
-- 12. Media lookup by entity (asset gallery)
-- ------------------------------------------------------------------
\echo '--- [12] Media lookup by entity ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT m.id, m."mediaType", m."originalName", m."mimeType",
       m."originalUrl", m."thumbnailUrl", m.status
FROM "Media" m
WHERE m."tenantId" = '00000000-0000-0000-0000-000000000001'
  AND m."entityType" = 'PRODUCT'
  AND m."entityId" = '00000000-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------
-- 13. Aggregate: daily order summary (analytics dashboard)
-- ------------------------------------------------------------------
\echo '--- [13] Daily order summary aggregation ---'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT date_trunc('day', o."createdAt") AS "day",
       o.status,
       COUNT(*) AS "orderCount",
       SUM(o.total) AS "revenue",
       AVG(o.total) AS "avgOrderValue"
FROM "Order" o
WHERE o."tenantId" = '00000000-0000-0000-0000-000000000001'
  AND o."branchId" = '00000000-0000-0000-0000-000000000002'
  AND o."createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY date_trunc('day', o."createdAt"), o.status
ORDER BY "day" DESC, o.status;

-- ------------------------------------------------------------------
-- 14. Index usage report
--    Run separately to identify unused or underperforming indexes.
-- ------------------------------------------------------------------
\echo '--- [14] Index usage statistics ---'
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS "times_used",
  idx_tup_read AS "rows_read",
  idx_tup_fetch AS "rows_fetched",
  pg_size_pretty(pg_relation_size(indexrelid)) AS "index_size"
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- ------------------------------------------------------------------
-- 15. Table bloat estimation
-- ------------------------------------------------------------------
\echo '--- [15] Table bloat / dead tuple report ---'
SELECT
  schemaname,
  relname AS "table_name",
  n_live_tup AS "live_rows",
  n_dead_tup AS "dead_rows",
  CASE WHEN n_live_tup > 0
    THEN round(n_dead_tup::numeric / n_live_tup * 100, 2)
    ELSE 0
  END AS "dead_pct",
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

\echo ''
\echo '============================================================='
\echo ' Profiling complete. Review query plans above for sequential scans,'
\echo ' high cost nodes, and row estimate accuracy.'
\echo '============================================================='
