#!/bin/bash
# ==============================================================================
# DOC-010 §10.3 — Pre-Deployment Migration Validation
# ==============================================================================
# Validates that pending migrations are safe to apply.
# Run this BEFORE deploying to production.
#
# Usage: bash migrate-validate.sh [DATABASE_URL]
# ==============================================================================

set -euo pipefail

DATABASE_URL="${1:-${DATABASE_URL:-}}"
ERRORS=0

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL must be set or passed as first argument."
  exit 1
fi

export DATABASE_URL

echo "=== Zayjar Pre-Deployment Migration Validation ==="
echo "Database: $(echo "$DATABASE_URL" | sed 's|://[^:]*:[^@]*@|://***:***@|')"
echo ""

cd "$(dirname "$0")/.." 2>/dev/null || true

# Check 1: Database connectivity
echo "--- [1/5] Database Connectivity ---"
if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "PASS: Database is reachable"
else
  echo "FAIL: Cannot connect to database"
  exit 1
fi
echo ""

# Check 2: Migration status — no drift
echo "--- [2/5] Migration Drift Detection ---"
DRIFT_OUTPUT=$(npx prisma migrate status 2>&1) || true
if echo "$DRIFT_OUTPUT" | grep -q "Database schema is up to date"; then
  echo "PASS: Schema is up to date, no drift"
elif echo "$DRIFT_OUTPUT" | grep -q "have not yet been applied"; then
  echo "INFO: Pending migrations detected (expected before deploy):"
  echo "$DRIFT_OUTPUT" | grep -A 20 "have not yet been applied" || true
elif echo "$DRIFT_OUTPUT" | grep -qi "drift"; then
  echo "FAIL: Schema drift detected!"
  echo "$DRIFT_OUTPUT"
  ERRORS=$((ERRORS + 1))
else
  echo "INFO: Migration status output:"
  echo "$DRIFT_OUTPUT"
fi
echo ""

# Check 3: Prisma schema syntax
echo "--- [3/5] Schema Validation ---"
if npx prisma validate 2>&1 | grep -q "valid"; then
  echo "PASS: Prisma schema is valid"
else
  echo "FAIL: Prisma schema validation failed"
  npx prisma validate 2>&1 || true
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 4: prisma generate — client matches schema
echo "--- [4/5] Prisma Client Generation ---"
GENERATE_OUTPUT=$(npx prisma generate 2>&1) || true
if echo "$GENERATE_OUTPUT" | grep -q "generated\|up to date\|Generated"; then
  echo "PASS: Prisma Client is up to date"
else
  echo "WARN: Could not confirm Prisma Client generation"
  echo "$GENERATE_OUTPUT"
fi
echo ""

# Check 5: Migration SQL files exist and are non-empty
echo "--- [5/5] Migration SQL Integrity ---"
MIGRATION_DIR="prisma/migrations"
if [ -d "$MIGRATION_DIR" ]; then
  MIGRATION_COUNT=$(find "$MIGRATION_DIR" -name "migration.sql" | wc -l)
  EMPTY_COUNT=$(find "$MIGRATION_DIR" -name "migration.sql" -empty | wc -l)
  echo "Total migrations: $MIGRATION_COUNT"
  echo "Empty migration files: $EMPTY_COUNT"
  if [ "$EMPTY_COUNT" -gt 0 ]; then
    echo "FAIL: Empty migration.sql files found"
    find "$MIGRATION_DIR" -name "migration.sql" -empty
    ERRORS=$((ERRORS + 1))
  else
    echo "PASS: All migration files are non-empty"
  fi

  # Check migration_lock.toml
  if [ -f "$MIGRATION_DIR/migration_lock.toml" ]; then
    PROVIDER=$(grep "provider" "$MIGRATION_DIR/migration_lock.toml" | cut -d'"' -f2)
    if [ "$PROVIDER" = "postgresql" ]; then
      echo "PASS: Migration lock provider is postgresql"
    else
      echo "FAIL: Migration lock provider is '$PROVIDER', expected 'postgresql'"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "FAIL: migration_lock.toml not found"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "SKIP: Migration directory not found"
fi
echo ""

# Summary
echo "=== Validation Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "RESULT: FAIL — $ERRORS error(s) found. Fix before deploying."
  exit 1
else
  echo "RESULT: PASS — All checks passed. Safe to deploy."
  exit 0
fi
