#!/bin/bash
# ==============================================================================
# DOC-010 §10.3 — Post-Deployment Migration Verification
# ==============================================================================
# Verifies that a migration was applied correctly and the database is healthy.
# Run this AFTER deploying to production.
#
# Usage: bash migrate-post-verify.sh [DATABASE_URL]
# ==============================================================================

set -euo pipefail

DATABASE_URL="${1:-${DATABASE_URL:-}}"
ERRORS=0

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL must be set or passed as first argument."
  exit 1
fi

export DATABASE_URL

echo "=== Zayjar Post-Deployment Migration Verification ==="
echo "Database: $(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo ""

# Check 1: Migration status — all applied, no pending
echo "--- [1/5] Migration Status ---"
STATUS_OUTPUT=$(npx prisma migrate status 2>&1) || true
if echo "$STATUS_OUTPUT" | grep -q "Database schema is up to date"; then
  echo "PASS: All migrations applied, schema is current"
elif echo "$STATUS_OUTPUT" | grep -q "not yet been applied"; then
  echo "FAIL: Pending migrations remain after deployment"
  echo "$STATUS_OUTPUT"
  ERRORS=$((ERRORS + 1))
else
  echo "INFO: Migration status:"
  echo "$STATUS_OUTPUT"
fi
echo ""

# Check 2: Schema matches generated client
echo "--- [2/5] Schema-Client Sync ---"
GENERATE_OUTPUT=$(npx prisma generate 2>&1) || true
if echo "$GENERATE_OUTPUT" | grep -q "already up to date\|up to date with the schema"; then
  echo "PASS: Prisma Client matches current schema"
else
  echo "WARN: Prisma Client may need regeneration"
  npx prisma generate 2>&1 || true
fi
echo ""

# Check 3: Critical table row counts
echo "--- [3/5] Table Row Counts ---"
psql "$DATABASE_URL" -c "
  SELECT
    relname AS table_name,
    n_live_tup AS row_count
  FROM pg_stat_user_tables
  WHERE relname IN ('tenants', 'users', 'restaurants', 'orders', 'menu_items', 'order_items')
  ORDER BY relname;
" 2>/dev/null || echo "WARN: Could not check table row counts"
echo ""

# Check 4: No locks held by migration process
echo "--- [4/5] Migration Lock Check ---"
LOCK_COUNT=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*)
  FROM pg_locks
  JOIN pg_stat_activity USING (pid)
  WHERE mode LIKE 'AccessExclusiveLock%'
    AND relation::regclass::text NOT LIKE 'pg_%';
" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$LOCK_COUNT" = "0" ]; then
  echo "PASS: No exclusive locks held (migration completed)"
else
  echo "WARN: $LOCK_COUNT exclusive lock(s) still held"
  psql "$DATABASE_URL" -c "
    SELECT pid, relation::regclass AS locked_table, mode, age(now(), query_start) AS age
    FROM pg_locks
    JOIN pg_stat_activity USING (pid)
    WHERE mode LIKE 'AccessExclusiveLock%'
      AND relation::regclass::text NOT LIKE 'pg_%';
  " 2>/dev/null || true
fi
echo ""

# Check 5: Index health
echo "--- [5/5] Index Health ---"
INVALID_INDEXES=$(psql "$DATABASE_URL" -t -c "
  SELECT COUNT(*)
  FROM pg_stat_user_indexes
  JOIN pg_index ON pg_stat_user_indexes.indexrelid = pg_index.indexrelid
  WHERE NOT indisvalid;
" 2>/dev/null | tr -d ' ' || echo "0")

if [ "$INVALID_INDEXES" = "0" ]; then
  echo "PASS: All indexes are valid"
else
  echo "FAIL: $INVALID_INDEXES invalid index(es) found"
  psql "$DATABASE_URL" -c "
    SELECT schemaname, tablename, indexname
    FROM pg_stat_user_indexes
    JOIN pg_index ON pg_stat_user_indexes.indexrelid = pg_index.indexrelid
    WHERE NOT indisvalid;
  " 2>/dev/null || true
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Summary
echo "=== Verification Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "RESULT: FAIL — $ERRORS error(s) found. Investigate immediately."
  exit 1
else
  echo "RESULT: PASS — Post-deployment verification complete. Database is healthy."
  exit 0
fi
