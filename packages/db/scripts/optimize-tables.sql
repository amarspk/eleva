-- ==============================================================================
-- DOC-010 §9.2 — Per-Table Autovacuum Tuning Overrides
-- ==============================================================================
-- Applies aggressive vacuum settings to the highest-write tables in the
-- Zayjar schema. Run once after initial deployment.
--
-- Usage:
--   psql "$DATABASE_URL" -f packages/db/scripts/optimize-tables.sql
-- ==============================================================================

\echo '============================================================='
\echo ' DOC-010 §9.2 — Applying per-table autovacuum overrides'
\echo '============================================================='

-- High-write: Orders (created every transaction)
ALTER TABLE "Order" SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.005,
  autovacuum_vacuum_cost_delay = 1,
  autovacuum_vacuum_cost_limit = 1200
);
\echo '  Applied overrides to "Order"'

-- High-write: OrderItem (2-10 rows per order)
ALTER TABLE "OrderItem" SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.005,
  autovacuum_vacuum_cost_delay = 1,
  autovacuum_vacuum_cost_limit = 1200
);
\echo '  Applied overrides to "OrderItem"'

-- High-write: OrderItemAddon
ALTER TABLE "OrderItemAddon" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 1
);
\echo '  Applied overrides to "OrderItemAddon"'

-- High-write: KitchenQueue (active during service, truncated after)
ALTER TABLE "KitchenQueue" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 1,
  autovacuum_vacuum_cost_limit = 1200
);
\echo '  Applied overrides to "KitchenQueue"'

-- High-write: SessionLog (auth token rotations)
ALTER TABLE "SessionLog" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 2
);
\echo '  Applied overrides to "SessionLog"'

-- High-write: AuditLog (append-only audit trail)
ALTER TABLE "AuditLog" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2
);
\echo '  Applied overrides to "AuditLog"'

-- High-write: Payment
ALTER TABLE "Payment" SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_cost_delay = 1
);
\echo '  Applied overrides to "Payment"'

-- Medium-write: Notification
ALTER TABLE "Notification" SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_cost_delay = 2
);
\echo '  Applied overrides to "Notification"'

-- Read-heavy: Product, Category, Tenant — use defaults (less aggressive)
\echo ''
\echo '  Product, Category, Tenant, Branch: using default autovacuum settings (read-heavy)'

-- ------------------------------------------------------------------
-- Verify applied settings
-- ------------------------------------------------------------------
\echo ''
\echo '--- Verifying per-table autovacuum settings ---'
SELECT
  relname AS table_name,
  reloptions
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND reloptions IS NOT NULL
ORDER BY relname;

\echo ''
\echo '============================================================='
\echo ' Per-table autovacuum tuning applied successfully.'
\echo '============================================================='
