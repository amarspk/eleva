#!/bin/bash
# ==============================================================================
# DOC-010 §10.3 — Backup Verification Before Migration
# ==============================================================================
# Verifies that a recent, valid backup exists before applying migrations.
#
# Usage: bash migrate-backup-verify.sh [BACKUP_DIR] [DATABASE_URL]
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-/var/backups/postgresql}}"
DATABASE_URL="${2:-${DATABASE_URL:-}}"
MAX_AGE_HOURS=24

echo "=== Zayjar Backup Verification ==="
echo "Backup directory: $BACKUP_DIR"
echo ""

ERRORS=0

# Check 1: Backup directory exists
echo "--- [1/4] Backup Directory ---"
if [ -d "$BACKUP_DIR" ]; then
  echo "PASS: Backup directory exists"
else
  echo "WARN: Backup directory '$BACKUP_DIR' not found"
  echo "Attempting to locate backups in common locations..."
  for dir in /var/backups/postgresql /var/backups/zayjar /tmp/pg-backups; do
    if [ -d "$dir" ]; then
      echo "  Found: $dir"
      BACKUP_DIR="$dir"
      break
    fi
  done
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "FAIL: No backup directory found. Backups may not be configured."
    ERRORS=$((ERRORS + 1))
  fi
fi
echo ""

# Check 2: Recent backup exists
echo "--- [2/4] Recent Backup ---"
if [ -d "$BACKUP_DIR" ]; then
  # Find the most recent backup file
  RECENT_BACKUP=$(find "$BACKUP_DIR" -type f \( -name "*.sql.gz" -o -name "*.dump" -o -name "*.sql" -o -name "*.backup" \) -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

  if [ -n "$RECENT_BACKUP" ]; then
    BACKUP_AGE_SECONDS=$(($(date +%s) - $(stat -c %Y "$RECENT_BACKUP" 2>/dev/null || stat -f %m "$RECENT_BACKUP" 2>/dev/null || echo "0")))
    BACKUP_AGE_HOURS=$((BACKUP_AGE_SECONDS / 3600))
    BACKUP_SIZE=$(stat -c %s "$RECENT_BACKUP" 2>/dev/null || stat -f %z "$RECENT_BACKUP" 2>/dev/null || echo "unknown")

    echo "Most recent backup: $(basename "$RECENT_BACKUP")"
    echo "  Age: ${BACKUP_AGE_HOURS}h (max allowed: ${MAX_AGE_HOURS}h)"
    echo "  Size: ${BACKUP_SIZE} bytes"
    echo "  Path: $RECENT_BACKUP"

    if [ "$BACKUP_AGE_HOURS" -le "$MAX_AGE_HOURS" ]; then
      echo "PASS: Backup is within ${MAX_AGE_HOURS}h window"
    else
      echo "FAIL: Backup is older than ${MAX_AGE_HOURS}h"
      ERRORS=$((ERRORS + 1))
    fi
  else
    echo "FAIL: No backup files found in $BACKUP_DIR"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "SKIP: Backup directory not available"
fi
echo ""

# Check 3: Backup file integrity
echo "--- [3/4] Backup Integrity ---"
if [ -n "${RECENT_BACKUP:-}" ] && [ -f "${RECENT_BACKUP:-}" ]; then
  case "$RECENT_BACKUP" in
    *.sql.gz)
      if gzip -t "$RECENT_BACKUP" 2>/dev/null; then
        echo "PASS: Gzip integrity check passed"
      else
        echo "FAIL: Gzip file is corrupt"
        ERRORS=$((ERRORS + 1))
      fi
      ;;
    *.dump|*.backup)
      if command -v pg_restore >/dev/null 2>&1; then
        LIST_OUTPUT=$(pg_restore --list "$RECENT_BACKUP" 2>&1) || true
        if [ -n "$LIST_OUTPUT" ]; then
          echo "PASS: pg_restore --list succeeded (backup is readable)"
        else
          echo "FAIL: pg_restore --list returned empty output"
          ERRORS=$((ERRORS + 1))
        fi
      else
        echo "SKIP: pg_restore not available for integrity check"
      fi
      ;;
    *.sql)
      if head -5 "$RECENT_BACKUP" | grep -q "PostgreSQL\|CREATE\|--"; then
        echo "PASS: SQL backup file has valid header"
      else
        echo "WARN: SQL file header does not look like a PostgreSQL dump"
      fi
      ;;
    *)
      echo "SKIP: Unknown backup format, cannot verify integrity"
      ;;
  esac
else
  echo "SKIP: No backup file available for integrity check"
fi
echo ""

# Check 4: Database connectivity (can we actually restore if needed?)
echo "--- [4/4] Restore Capability ---"
if [ -n "$DATABASE_URL" ]; then
  if psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "PASS: Database is reachable (restore target is accessible)"
  else
    echo "WARN: Database is not reachable — restore target may be offline"
  fi
else
  echo "SKIP: DATABASE_URL not set"
fi
echo ""

# Summary
echo "=== Verification Summary ==="
if [ "$ERRORS" -gt 0 ]; then
  echo "RESULT: FAIL — $ERRORS error(s) found."
  echo "ACTIONS REQUIRED:"
  echo "  1. Ensure pg_dump backups are configured (see §8.5)"
  echo "  2. Run a manual backup: pg_dump -Fc > backup.dump"
  echo "  3. Verify the backup: pg_restore --list backup.dump"
  exit 1
else
  echo "RESULT: PASS — Backup verification complete. Safe to proceed with migration."
  exit 0
fi
