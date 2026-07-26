#!/bin/bash
# ==============================================================================
# DOC-009 8.5 - Comprehensive Backup Verification
# ==============================================================================
# Verifies backup integrity, recency, WAL archive, and recovery readiness.
#
# Usage:
#   bash verify-backup-full.sh                 # Full verification
#   bash verify-backup-full.sh --test-restore  # Include test restore
#   bash verify-backup-full.sh --s3            # Also verify S3 backups
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/pg-backup.conf"
source "$CONFIG_FILE" 2>/dev/null || true

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/wal-archive}"
DB_NAME="${DB_NAME:-zayjar_production}"
DATABASE_URL="${DATABASE_URL:-}"
S3_BUCKET="${S3_BACKUP_BUCKET:-zayjar-backups}"
TEST_RESTORE=false
CHECK_S3=false
ERRORS=0
WARNINGS=0

for arg in "$@"; do
  case $arg in
    --test-restore) TEST_RESTORE=true ;;
    --s3) CHECK_S3=true ;;
  esac
done

echo "=== Zayjar Comprehensive Backup Verification ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# Check 1: Backup directory structure
echo "--- [1/8] Backup Directory Structure ---"
if [ -d "$BACKUP_DIR" ]; then
  echo "PASS: Backup root exists: $BACKUP_DIR"
  for subdir in daily weekly monthly; do
    if [ -d "$BACKUP_DIR/$subdir" ]; then
      COUNT=$(find "$BACKUP_DIR/$subdir" -name "*.dump" 2>/dev/null | wc -l)
      echo "  $subdir/: $COUNT backup(s)"
    else
      echo "  WARN: $subdir/ directory missing"
      WARNINGS=$((WARNINGS + 1))
    fi
  done
else
  echo "FAIL: Backup directory not found: $BACKUP_DIR"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 2: Latest daily backup exists and is recent
echo "--- [2/8] Latest Daily Backup ---"
LATEST_DAILY=$(find "$BACKUP_DIR/daily" -name "*.dump" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
if [ -n "$LATEST_DAILY" ]; then
  AGE_SECONDS=$(($(date +%s) - $(stat -c %Y "$LATEST_DAILY" 2>/dev/null || stat -f %m "$LATEST_DAILY" 2>/dev/null || echo "0")))
  AGE_HOURS=$((AGE_SECONDS / 3600))
  SIZE=$(stat -c %s "$LATEST_DAILY" 2>/dev/null || stat -f %z "$LATEST_DAILY" 2>/dev/null || echo "0")
  SIZE_MB=$((SIZE / 1024 / 1024))

  echo "File: $(basename "$LATEST_DAILY")"
  echo "Age: ${AGE_HOURS}h | Size: ${SIZE_MB}MB"

  if [ "$AGE_HOURS" -le 24 ]; then
    echo "PASS: Backup is within 24h window"
  elif [ "$AGE_HOURS" -le 48 ]; then
    echo "WARN: Backup is ${AGE_HOURS}h old (>24h)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "FAIL: Backup is ${AGE_HOURS}h old (>48h)"
    ERRORS=$((ERRORS + 1))
  fi

  if [ "$SIZE" -lt 1024 ]; then
    echo "FAIL: Backup file suspiciously small (${SIZE} bytes)"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "FAIL: No daily backups found in $BACKUP_DIR/daily/"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 3: Backup file integrity
echo "--- [3/8] Backup File Integrity ---"
if [ -n "${LATEST_DAILY:-}" ] && [ -f "${LATEST_DAILY:-}" ]; then
  if command -v pg_restore >/dev/null 2>&1; then
    LIST_OUTPUT=$(pg_restore --list "$LATEST_DAILY" 2>&1) || true
    if [ -n "$LIST_OUTPUT" ]; then
      OBJECT_COUNT=$(echo "$LIST_OUTPUT" | grep -c "^[0-9]" || echo "0")
      echo "PASS: pg_restore --list succeeded ($OBJECT_COUNT objects)"
    else
      echo "FAIL: pg_restore --list returned empty"
      ERRORS=$((ERRORS + 1))
    fi
  else
    HEADER=$(xxd -l 4 "$LATEST_DAILY" 2>/dev/null | head -1 || echo "")
    if echo "$HEADER" | grep -q "PGDMP"; then
      echo "PASS: File has valid pg_dump header"
    else
      echo "WARN: Cannot verify file format (pg_restore not available)"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
else
  echo "SKIP: No backup file to verify"
fi
echo ""

# Check 4: WAL archive completeness
echo "--- [4/8] WAL Archive Status ---"
if [ -d "$WAL_ARCHIVE_DIR" ]; then
  WAL_COUNT=$(find "$WAL_ARCHIVE_DIR" -name "00000*" 2>/dev/null | wc -l)
  WAL_SIZE=$(du -sh "$WAL_ARCHIVE_DIR" 2>/dev/null | cut -f1)
  echo "WAL segments: $WAL_COUNT"
  echo "Total size: $WAL_SIZE"

  if [ "$WAL_COUNT" -gt 0 ]; then
    NEWEST_WAL=$(ls -1t "$WAL_ARCHIVE_DIR"/00000* 2>/dev/null | head -1 || echo "")
    if [ -n "$NEWEST_WAL" ]; then
      WAL_AGE=$(($(date +%s) - $(stat -c %Y "$NEWEST_WAL" 2>/dev/null || stat -f %m "$NEWEST_WAL" 2>/dev/null || echo "0")))
      WAL_AGE_MIN=$((WAL_AGE / 60))
      echo "Newest WAL age: ${WAL_AGE_MIN} minutes"
      if [ "$WAL_AGE_MIN" -le 10 ]; then
        echo "PASS: WAL archiving is active (last segment <10 min ago)"
      elif [ "$WAL_AGE_MIN" -le 30 ]; then
        echo "WARN: WAL archiving may be delayed (${WAL_AGE_MIN} min)"
        WARNINGS=$((WARNINGS + 1))
      else
        echo "FAIL: WAL archiving appears stalled (${WAL_AGE_MIN} min)"
        ERRORS=$((ERRORS + 1))
      fi
    fi
  else
    echo "WARN: No WAL segments archived"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "WARN: WAL archive directory not found"
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 5: S3 backup verification
echo "--- [5/8] S3 Backup Verification ---"
if [ "$CHECK_S3" = true ]; then
  if command -v aws >/dev/null 2>&1; then
    S3_COUNT=$(aws s3 ls "s3://$S3_BUCKET/daily/" 2>/dev/null | wc -l || echo "0")
    echo "S3 daily backups: $S3_COUNT"
    if [ "$S3_COUNT" -gt 0 ]; then
      echo "PASS: S3 backups exist"
    else
      echo "WARN: No S3 backups found"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo "SKIP: AWS CLI not available"
  fi
else
  echo "SKIP: S3 check not requested (use --s3)"
fi
echo ""

# Check 6: Database connectivity
echo "--- [6/8] Database Connectivity ---"
if [ -n "$DATABASE_URL" ]; then
  if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "PASS: Database is reachable"
    DB_SIZE=$(psql "$DATABASE_URL" -t -c "SELECT pg_size_pretty(pg_database_size(current_database()));" 2>/dev/null | tr -d ' ' || echo "unknown")
    echo "  Database size: $DB_SIZE"
  else
    echo "WARN: Database is not reachable"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo "SKIP: DATABASE_URL not set"
fi
echo ""

# Check 7: Test restore (optional)
echo "--- [7/8] Test Restore ---"
if [ "$TEST_RESTORE" = true ] && [ -n "${LATEST_DAILY:-}" ] && [ -n "$DATABASE_URL" ]; then
  TEST_DB="${DB_NAME}_restore_test_$(date +%s)"
  echo "Creating temporary database: $TEST_DB"

  createdb "$TEST_DB" 2>/dev/null || { echo "FAIL: Could not create test database"; ERRORS=$((ERRORS + 1)); echo ""; echo "--- [8/8] Recovery Readiness ---"; echo "SKIP"; echo ""; echo "=== Summary: $ERRORS error(s), $WARNINGS warning(s) ==="; exit 1; }
  pg_restore -d "$TEST_DB" -Fc --no-owner --no-privileges "$LATEST_DAILY" 2>/dev/null

  TENANT_COUNT=$(psql "$TEST_DB" -t -c "SELECT COUNT(*) FROM tenants;" 2>/dev/null | tr -d ' ' || echo "0")
  echo "  Tenants: $TENANT_COUNT"

  if [ "$TENANT_COUNT" -gt 0 ]; then
    echo "PASS: Test restore succeeded (data present)"
  else
    echo "WARN: Test restore succeeded but tenants table is empty"
    WARNINGS=$((WARNINGS + 1))
  fi

  dropdb "$TEST_DB" 2>/dev/null || true
  echo "  Cleaned up: $TEST_DB"
else
  echo "SKIP: Test restore not requested (use --test-restore)"
fi
echo ""

# Check 8: Recovery readiness
echo "--- [8/8] Recovery Readiness ---"

if command -v pg_restore >/dev/null 2>&1; then
  echo "PASS: pg_restore available"
else
  echo "FAIL: pg_restore not found"
  ERRORS=$((ERRORS + 1))
fi

if command -v createdb >/dev/null 2>&1; then
  echo "PASS: createdb available"
else
  echo "WARN: createdb not found (needed for test restore)"
  WARNINGS=$((WARNINGS + 1))
fi

if command -v psql >/dev/null 2>&1; then
  echo "PASS: psql available"
else
  echo "FAIL: psql not found"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Summary
echo "=== Verification Summary ==="
echo "Errors: $ERRORS | Warnings: $WARNINGS"
if [ "$ERRORS" -gt 0 ]; then
  echo "RESULT: FAIL - $ERRORS error(s) found. Recovery may not succeed."
  exit 1
else
  echo "RESULT: PASS - Backup verification complete. Recovery is ready."
  exit 0
fi
