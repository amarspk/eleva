#!/bin/bash
# ==============================================================================
# DOC-009 §8.5 — Automated PostgreSQL Backup
# ==============================================================================
# Performs a full logical backup via pg_dump with compression.
# Supports daily, weekly, and monthly retention tiers.
# Optionally uploads to S3 for cross-region disaster recovery.
#
# Usage:
#   bash backup-postgres.sh                          # Full backup
#   bash backup-postgres.sh --dry-run                # Preview without executing
#   bash backup-postgres.sh --s3                     # Also upload to S3
#   bash backup-postgres.sh --prune                  # Only prune old backups
#
# Environment: DATABASE_URL, or source pg-backup.conf
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/pg-backup.conf"
source "$CONFIG_FILE" 2>/dev/null || true

DRY_RUN=false
UPLOAD_S3=false
PRUNE_ONLY=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --s3) UPLOAD_S3=true ;;
    --prune) PRUNE_ONLY=true ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--s3] [--prune]"
      exit 0
      ;;
  esac
done

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgresql}"
DB_NAME="${DB_NAME:-zayjar_production}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-28}"
RETENTION_MONTHLY="${RETENTION_MONTHLY:-365}"

echo "=== Zayjar PostgreSQL Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Database: $DB_NAME"
echo "Backup directory: $BACKUP_DIR"
echo "Dry run: $DRY_RUN"
echo ""

# Ensure backup directories exist
if [ "$DRY_RUN" = false ]; then
  mkdir -p "$BACKUP_DIR/daily"
  mkdir -p "$BACKUP_DIR/weekly"
  mkdir -p "$BACKUP_DIR/monthly"
fi

# Prune old backups
if [ "$PRUNE_ONLY" = true ] || [ "$DRY_RUN" = false ]; then
  echo "--- Pruning old backups ---"

  # Daily: keep last N days
  DAILY_COUNT=$(find "$BACKUP_DIR/daily" -name "*.dump" -mtime +$RETENTION_DAILY 2>/dev/null | wc -l)
  if [ "$DAILY_COUNT" -gt 0 ]; then
    echo "  Pruning $DAILY_COUNT daily backup(s) older than ${RETENTION_DAILY} days"
    if [ "$DRY_RUN" = false ]; then
      find "$BACKUP_DIR/daily" -name "*.dump" -mtime +$RETENTION_DAILY -delete
    fi
  else
    echo "  No daily backups to prune"
  fi

  # Weekly: keep last N weeks
  WEEKLY_COUNT=$(find "$BACKUP_DIR/weekly" -name "*.dump" -mtime +$RETENTION_WEEKLY 2>/dev/null | wc -l)
  if [ "$WEEKLY_COUNT" -gt 0 ]; then
    echo "  Pruning $WEEKLY_COUNT weekly backup(s) older than ${RETENTION_WEEKLY} days"
    if [ "$DRY_RUN" = false ]; then
      find "$BACKUP_DIR/weekly" -name "*.dump" -mtime +$RETENTION_WEEKLY -delete
    fi
  else
    echo "  No weekly backups to prune"
  fi

  # Monthly: keep last N months
  MONTHLY_COUNT=$(find "$BACKUP_DIR/monthly" -name "*.dump" -mtime +$RETENTION_MONTHLY 2>/dev/null | wc -l)
  if [ "$MONTHLY_COUNT" -gt 0 ]; then
    echo "  Pruning $MONTHLY_COUNT monthly backup(s) older than ${RETENTION_MONTHLY} days"
    if [ "$DRY_RUN" = false ]; then
      find "$BACKUP_DIR/monthly" -name "*.dump" -mtime +$RETENTION_MONTHLY -delete
    fi
  else
    echo "  No monthly backups to prune"
  fi
  echo ""
fi

if [ "$PRUNE_ONLY" = true ]; then
  echo "=== Prune Complete ==="
  exit 0
fi

# Perform backup
DAILY_FILE="$BACKUP_DIR/daily/${DB_NAME}_${TIMESTAMP}.dump"

echo "--- Performing backup ---"
echo "  Output: $DAILY_FILE"

if [ "$DRY_RUN" = true ]; then
  echo "  [DRY RUN] Would execute: pg_dump -Fc --no-owner --no-privileges -f $DAILY_FILE"
else
  pg_dump -Fc --no-owner --no-privileges -f "$DAILY_FILE" "$DATABASE_URL"
  BACKUP_SIZE=$(stat -c %s "$DAILY_FILE" 2>/dev/null || stat -f %z "$DAILY_FILE" 2>/dev/null || echo "unknown")
  echo "  Backup complete: ${BACKUP_SIZE} bytes"
fi
echo ""

# Weekly backup (Sundays)
DOW=$(date +%u)
if [ "$DOW" -eq 7 ]; then
  WEEKLY_FILE="$BACKUP_DIR/weekly/${DB_NAME}_${TIMESTAMP}.dump"
  echo "--- Creating weekly backup ---"
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would copy to: $WEEKLY_FILE"
  else
    cp "$DAILY_FILE" "$WEEKLY_FILE"
    echo "  Weekly backup: $WEEKLY_FILE"
  fi
  echo ""
fi

# Monthly backup (1st of month)
DOM=$(date +%d)
if [ "$DOM" -eq 1 ]; then
  MONTHLY_FILE="$BACKUP_DIR/monthly/${DB_NAME}_${TIMESTAMP}.dump"
  echo "--- Creating monthly backup ---"
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would copy to: $MONTHLY_FILE"
  else
    cp "$DAILY_FILE" "$MONTHLY_FILE"
    echo "  Monthly backup: $MONTHLY_FILE"
  fi
  echo ""
fi

# S3 upload
if [ "$UPLOAD_S3" = true ]; then
  S3_BUCKET="${S3_BACKUP_BUCKET:-zayjar-backups}"
  S3_PREFIX="daily/${DB_NAME}_${TIMESTAMP}.dump"
  echo "--- Uploading to S3 ---"
  echo "  Destination: s3://$S3_BUCKET/$S3_PREFIX"
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would upload to S3"
  else
    aws s3 cp "$DAILY_FILE" "s3://$S3_BUCKET/$S3_PREFIX" --storage-class STANDARD_IA
    echo "  S3 upload complete"
  fi
  echo ""
fi

# Summary
echo "=== Backup Summary ==="
echo "  Daily backup:  $DAILY_FILE"
if [ "$DOW" -eq 7 ]; then
  echo "  Weekly backup: $WEEKLY_FILE"
fi
if [ "$DOM" -eq 1 ]; then
  echo "  Monthly backup: $MONTHLY_FILE"
fi
if [ "$UPLOAD_S3" = true ]; then
  echo "  S3 upload: s3://$S3_BUCKET/$S3_PREFIX"
fi
echo "  Retention: ${RETENTION_DAILY}d daily, ${RETENTION_WEEKLY}d weekly, ${RETENTION_MONTHLY}d monthly"
echo "=== Backup Complete ==="
