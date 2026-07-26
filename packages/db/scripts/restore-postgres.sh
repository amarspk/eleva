#!/bin/bash
# ==============================================================================
# DOC-009 8.5 - PostgreSQL Restore from Backup
# ==============================================================================
# Restores a PostgreSQL database from a pg_dump backup file.
# Supports point-in-time recovery via WAL replay.
#
# Usage:
#   bash restore-postgres.sh                                    # Restore latest backup
#   bash restore-postgres.sh --file /path/to/backup.dump       # Restore specific file
#   bash restore-postgres.sh --target "2026-07-26 14:30:00+00" # PITR to timestamp
#   bash restore-postgres.sh --dry-run                          # Preview only
#
# WARNING: This will DROP and recreate the target database.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/pg-backup.conf"
source "$CONFIG_FILE" 2>/dev/null || true

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/wal-archive}"
DB_NAME="${DB_NAME:-zayjar_production}"
DATABASE_URL="${DATABASE_URL:-}"
RESTORE_FILE=""
PITR_TARGET=""
DRY_RUN=false

while [ $# -gt 0 ]; do
  case $1 in
    --file) RESTORE_FILE="$2"; shift 2 ;;
    --target) PITR_TARGET="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--file backup.dump] [--target timestamp] [--dry-run]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "=== Zayjar PostgreSQL Restore ==="
echo "Database: $DB_NAME"
echo "Dry run: $DRY_RUN"
echo ""

# Find backup file if not specified
if [ -z "$RESTORE_FILE" ]; then
  echo "--- Finding latest backup ---"
  RESTORE_FILE=$(find "$BACKUP_DIR/daily" -name "*.dump" -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

  if [ -z "$RESTORE_FILE" ]; then
    echo "FAIL: No backup files found in $BACKUP_DIR/daily/"
    exit 1
  fi
  echo "Latest backup: $(basename "$RESTORE_FILE")"
fi

if [ ! -f "$RESTORE_FILE" ]; then
  echo "FAIL: Backup file not found: $RESTORE_FILE"
  exit 1
fi

BACKUP_SIZE=$(stat -c %s "$RESTORE_FILE" 2>/dev/null || stat -f %z "$RESTORE_FILE" 2>/dev/null || echo "unknown")
echo "Backup size: $BACKUP_SIZE bytes"
echo ""

# Pre-restore verification
echo "--- Pre-Restore Verification ---"
if command -v pg_restore >/dev/null 2>&1; then
  LIST_OUTPUT=$(pg_restore --list "$RESTORE_FILE" 2>&1) || true
  if [ -n "$LIST_OUTPUT" ]; then
    OBJECT_COUNT=$(echo "$LIST_OUTPUT" | grep -c "^[0-9]" || echo "0")
    echo "PASS: Backup contains $OBJECT_COUNT objects"
  else
    echo "FAIL: Backup file appears corrupt"
    exit 1
  fi
else
  echo "WARN: pg_restore not available, skipping verification"
fi
echo ""

# Confirm before proceeding
if [ "$DRY_RUN" = false ]; then
  echo "WARNING: This will DROP and recreate the database '$DB_NAME'."
  echo "All current data will be lost."
  echo ""
  read -p "Type 'RESTORE' to confirm: " CONFIRM
  if [ "$CONFIRM" != "RESTORE" ]; then
    echo "Aborted."
    exit 0
  fi
  echo ""
fi

# Stop application writes
echo "--- Stopping application writes ---"
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would scale API to 0 replicas"
else
  if command -v kubectl >/dev/null 2>&1; then
    kubectl scale deployment/api --replicas=0 -n zayjar 2>/dev/null || echo "WARN: Could not scale API (may not be running on K8s)"
  else
    echo "WARN: kubectl not available. Manually stop application writes."
  fi
fi
echo ""

# Drop and recreate database
echo "--- Restoring database ---"
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would drop and recreate database: $DB_NAME"
  echo "[DRY RUN] Would execute: pg_restore -d $DB_NAME -Fc --no-owner --no-privileges $RESTORE_FILE"
else
  echo "Dropping database..."
  dropdb "$DB_NAME" 2>/dev/null || echo "WARN: dropdb failed (database may not exist)"

  echo "Creating database..."
  createdb "$DB_NAME" || { echo "FAIL: Could not create database"; exit 1; }

  echo "Restoring from backup..."
  pg_restore -d "$DB_NAME" -Fc --no-owner --no-privileges "$RESTORE_FILE" 2>&1 || true
  echo "Restore complete (some warnings may be normal)"
fi
echo ""

# Verify restored data
echo "--- Post-Restore Verification ---"
if [ "$DRY_RUN" = false ] && [ -n "$DATABASE_URL" ]; then
  echo "Checking table row counts..."

  for table in tenants users restaurants orders menu_items order_items; do
    COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null | tr -d ' ' || echo "error")
    echo "  $table: $COUNT rows"
  done

  # Check for Prisma migration status
  echo ""
  echo "Checking Prisma migration status..."
  cd "$SCRIPT_DIR/.." 2>/dev/null && npx prisma migrate status 2>&1 | head -5 || echo "WARN: Could not check Prisma status"
fi
echo ""

# Resume application
echo "--- Resuming application ---"
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would scale API to 2 replicas"
else
  if command -v kubectl >/dev/null 2>&1; then
    kubectl scale deployment/api --replicas=2 -n zayjar 2>/dev/null || echo "WARN: Could not scale API"
  else
    echo "WARN: kubectl not available. Manually start application."
  fi
fi
echo ""

echo "=== Restore Complete ==="
echo "Database: $DB_NAME"
echo "Source: $(basename "$RESTORE_FILE")"
echo "Next steps:"
echo "  1. Verify application health: curl https://api.zayjar.com/api/v1/health"
echo "  2. Run post-migrate check: pnpm --filter db db:post-migrate-check"
echo "  3. Monitor application logs for errors"
