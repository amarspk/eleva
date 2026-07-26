-- ==============================================================================
-- DOC-010 §9.2 — Database Health Monitoring Views
-- ==============================================================================
-- Run these to create monitoring views and run health checks.
--
-- Usage:
--   psql "$DATABASE_URL" -f packages/db/scripts/db-health-checks.sql
-- ==============================================================================

\echo '============================================================='
\echo ' DOC-010 §9.2 — Database Health Checks'
\echo '============================================================='
\echo ''

-- ------------------------------------------------------------------
-- VIEW: Table size report (detect bloat early)
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid::regclass)) AS index_size,
  pg_total_relation_size(relid) AS total_bytes
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY total_bytes DESC;

\echo '--- Table sizes ---'
SELECT * FROM v_table_sizes;

-- ------------------------------------------------------------------
-- VIEW: Index health (unused + duplicate indexes)
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_index_health AS
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS times_used,
  idx_tup_read AS rows_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_scan < 10 THEN 'LOW USAGE'
    ELSE 'ACTIVE'
  END AS usage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

\echo ''
\echo '--- Index health ---'
SELECT * FROM v_index_health;

-- ------------------------------------------------------------------
-- VIEW: Dead tuple accumulation
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_dead_tuple_report AS
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  CASE WHEN n_live_tup > 0
    THEN round(n_dead_tup::numeric / n_live_tup * 100, 2)
    ELSE 0
  END AS dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 0
ORDER BY n_dead_tup DESC;

\echo ''
\echo '--- Dead tuple report ---'
SELECT * FROM v_dead_tuple_report;

-- ------------------------------------------------------------------
-- VIEW: Table bloat estimation (live vs dead ratio)
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_table_bloat AS
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup,
  n_dead_tup,
  CASE WHEN n_live_tup > 0
    THEN round(n_dead_tup::numeric / (n_live_tup + n_dead_tup) * 100, 2)
    ELSE 0
  END AS bloat_pct,
  CASE
    WHEN n_dead_tup > 10000 AND (n_dead_tup::numeric / GREATEST(n_live_tup, 1)) > 0.1
    THEN 'VACUUM URGENT'
    WHEN n_dead_tup > 1000
    THEN 'VACUUM RECOMMENDED'
    ELSE 'OK'
  END AS recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

\echo ''
\echo '--- Table bloat ---'
SELECT * FROM v_table_bloat;

-- ------------------------------------------------------------------
-- VIEW: Connection pool stats (PgBouncer monitoring)
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_connection_stats AS
SELECT
  datname AS database,
  numbackends AS active_connections,
  xact_commit AS committed_txns,
  xact_rollback AS rolled_back_txns,
  blks_read AS blocks_read,
  blks_hit AS blocks_hit,
  CASE WHEN (blks_read + blks_hit) > 0
    THEN round(blks_hit::numeric / (blks_read + blks_hit) * 100, 2)
    ELSE 100
  END AS cache_hit_ratio,
  tup_returned AS rows_returned,
  tup_fetched AS rows_fetched,
  tup_inserted AS rows_inserted,
  tup_updated AS rows_updated,
  tup_deleted AS rows_deleted
FROM pg_stat_database
WHERE datname = current_database();

\echo ''
\echo '--- Connection & cache stats ---'
SELECT * FROM v_connection_stats;

-- ------------------------------------------------------------------
-- VIEW: Lock monitoring (detect blocked queries)
-- ------------------------------------------------------------------
CREATE OR REPLACE VIEW v_lock_monitor AS
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_query,
  blocking_activity.query AS blocking_query,
  now() - blocked_activity.query_start AS waiting_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

\echo ''
\echo '--- Lock monitor (blocking queries) ---'
SELECT * FROM v_lock_monitor;

-- ------------------------------------------------------------------
-- CHECK: Autovacuum status
-- ------------------------------------------------------------------
\echo ''
\echo '--- Autovacuum configuration ---'
SHOW autovacuum;
SHOW autovacuum_max_workers;
SHOW autovacuum_vacuum_scale_factor;
SHOW autovacuum_analyze_scale_factor;
SHOW autovacuum_vacuum_cost_delay;
SHOW autovacuum_vacuum_cost_limit;
SHOW autovacuum_naptime;

\echo ''
\echo '============================================================='
\echo ' Health checks complete.'
\echo '============================================================='
