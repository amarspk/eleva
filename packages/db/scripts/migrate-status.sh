#!/bin/bash
# ==============================================================================
# DOC-010 §10.3 — Migration Status Check
# ==============================================================================
# Shows current migration status: applied, pending, and drift detection.
#
# Usage: bash migrate-status.sh [DATABASE_URL]
# ==============================================================================

set -euo pipefail

DATABASE_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL must be set or passed as first argument."
  exit 1
fi

export DATABASE_URL

echo "=== Zayjar Migration Status ==="
echo "Database: $(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo ""

# Check database connectivity
echo "--- Connectivity Check ---"
if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "OK: Database is reachable"
else
  echo "FAIL: Cannot connect to database"
  exit 1
fi
echo ""

# Check migration lock
echo "--- Migration Lock ---"
psql "$DATABASE_URL" -c "
  SELECT provider, locked_at
  FROM _prisma_migrations_lock
  LIMIT 1;
" 2>/dev/null || echo "NOTE: _prisma_migrations_lock not found (migrations may not have been applied yet)"
echo ""

# List applied migrations
echo "--- Applied Migrations ---"
psql "$DATABASE_URL" -c "
  SELECT
    migration_name,
    applied_at,
    CASE
      WHEN rolled_back_at IS NOT NULL THEN 'ROLLED BACK'
      WHEN finished_at IS NOT NULL THEN 'APPLIED'
      ELSE 'IN PROGRESS'
    END AS status
  FROM _prisma_migrations
  ORDER BY applied_at;
" 2>/dev/null || echo "NOTE: _prisma_migrations not found"
echo ""

# Check for pending migrations via Prisma
echo "--- Pending Migrations (prisma migrate status) ---"
cd "$(dirname "$0")/.." 2>/dev/null || true
if command -v npx >/dev/null 2>&1; then
  npx prisma migrate status 2>&1 || echo "WARN: prisma migrate status failed"
else
  echo "SKIP: npx not found"
fi
echo ""

# Check for invalid indexes
echo "--- Index Health ---"
psql "$DATABASE_URL" -c "
  SELECT
    schemaname,
    tablename,
    indexname,
    CASE WHEN indisvalid THEN 'VALID' ELSE 'INVALID' END AS status
  FROM pg_stat_user_indexes
  JOIN pg_index ON pg_stat_user_indexes.indexrelid = pg_index.indexrelid
  WHERE NOT indisvalid;
" 2>/dev/null || echo "NOTE: Could not check index health"
echo ""

# Check for long-running locks
echo "--- Active Locks (potential migration blockers) ---"
psql "$DATABASE_URL" -c "
  SELECT
    pid,
    relation::regclass AS locked_table,
    mode,
    granted,
    age(now(), query_start) AS query_age
  FROM pg_locks
  JOIN pg_stat_activity USING (pid)
  WHERE relation IS NOT NULL
    AND relation::regclass::text NOT LIKE 'pg_%'
    AND age(now(), query_start) > interval '5 minutes';
" 2>/dev/null || echo "NOTE: Could not check locks"

echo ""
echo "=== Status Check Complete ==="
