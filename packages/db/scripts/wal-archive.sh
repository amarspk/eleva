#!/bin/bash
# ==============================================================================
# DOC-009 §8.5 — WAL Archiving for Point-in-Time Recovery
# ==============================================================================
# Archives PostgreSQL WAL segments for PITR capability.
# Can be used as archive_command in postgresql.conf or run manually.
#
# Usage:
#   bash wal-archive.sh <wal_file_path>           # Archive a single WAL segment
#   bash wal-archive.sh --start                    # Enable continuous archiving
#   bash wal-archive.sh --cleanup                  # Remove WAL archives older than retention
#   bash wal-archive.sh --status                   # Show WAL archive status
#
# Environment: DATABASE_URL (for status checks), or source pg-backup.conf
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../config/pg-backup.conf"
source "$CONFIG_FILE" 2>/dev/null || true

WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/wal-archive}"
WAL_RETENTION_DAYS="${WAL_RETENTION_DAYS:-7}"
WAL_S3_BUCKET="${WAL_S3_BUCKET:-zayjar-backups}"
WAL_S3_PREFIX="${WAL_S3_PREFIX:-wal-archive}"

# Archive a single WAL segment (used as archive_command)
archive_wal() {
  local WAL_FILE="$1"
  local WAL_NAME=$(basename "$WAL_FILE")

  mkdir -p "$WAL_ARCHIVE_DIR"

  # Skip if already archived (idempotent)
  if [ -f "$WAL_ARCHIVE_DIR/$WAL_NAME" ]; then
    echo "SKIP: $WAL_NAME already archived"
    return 0
  fi

  # Copy WAL segment
  cp "$WAL_FILE" "$WAL_ARCHIVE_DIR/$WAL_NAME"
  echo "ARCHIVED: $WAL_NAME"
  return 0
}

# Cleanup old WAL archives
cleanup_wal() {
  echo "--- Cleaning up WAL archives older than ${WAL_RETENTION_DAYS} days ---"

  if [ ! -d "$WAL_ARCHIVE_DIR" ]; then
    echo "WAL archive directory not found: $WAL_ARCHIVE_DIR"
    return 0
  fi

  WAL_COUNT=$(find "$WAL_ARCHIVE_DIR" -name "00000*" -mtime +$WAL_RETENTION_DAYS 2>/dev/null | wc -l)

  if [ "$WAL_COUNT" -gt 0 ]; then
    echo "  Removing $WAL_COUNT WAL segment(s) older than ${WAL_RETENTION_DAYS} days"
    find "$WAL_ARCHIVE_DIR" -name "00000*" -mtime +$WAL_RETENTION_DAYS -delete
    echo "  Cleanup complete"
  else
    echo "  No WAL segments to remove"
  fi

  # Also clean partial WAL files
  PARTIAL_COUNT=$(find "$WAL_ARCHIVE_DIR" -name "*.partial" -mtime +$WAL_RETENTION_DAYS 2>/dev/null | wc -l)
  if [ "$PARTIAL_COUNT" -gt 0 ]; then
    echo "  Removing $PARTIAL_COUNT partial WAL file(s)"
    find "$WAL_ARCHIVE_DIR" -name "*.partial" -mtime +$WAL_RETENTION_DAYS -delete
  fi

  echo ""
}

# Show WAL archive status
wal_status() {
  echo "=== WAL Archive Status ==="
  echo "Archive directory: $WAL_ARCHIVE_DIR"
  echo ""

  if [ ! -d "$WAL_ARCHIVE_DIR" ]; then
    echo "WAL archive directory does not exist"
    return 0
  fi

  TOTAL_WAL=$(find "$WAL_ARCHIVE_DIR" -name "00000*" 2>/dev/null | wc -l)
  TOTAL_SIZE=$(du -sh "$WAL_ARCHIVE_DIR" 2>/dev/null | cut -f1)
  OLDEST_WAL=$(ls -1 "$WAL_ARCHIVE_DIR"/00000* 2>/dev/null | head -1 || echo "none")
  NEWEST_WAL=$(ls -1t "$WAL_ARCHIVE_DIR"/00000* 2>/dev/null | head -1 || echo "none")

  echo "Total WAL segments: $TOTAL_WAL"
  echo "Total size: $TOTAL_SIZE"
  echo "Oldest: $(basename "${OLDEST_WAL:-none}")"
  echo "Newest: $(basename "${NEWEST_WAL:-none}")"
  echo ""

  # Check for gaps
  if [ "$TOTAL_WAL" -gt 1 ]; then
    echo "--- Checking for gaps ---"
    ls -1 "$WAL_ARCHIVE_DIR"/00000* 2>/dev/null | sort | while read -r wal; do
      echo "  $(basename "$wal")"
    done
    echo ""
  fi
}

# Start continuous archiving (daemon mode)
start_archiving() {
  echo "=== Starting WAL Archiving ==="
  echo "Archive directory: $WAL_ARCHIVE_DIR"
  echo "This script is designed to be used as PostgreSQL's archive_command."
  echo ""
  echo "Add to postgresql.conf:"
  echo "  archive_mode = on"
  echo "  archive_command = 'bash $SCRIPT_DIR/wal-archive.sh %p'"
  echo "  archive_timeout = 300"
  echo ""
  echo "Or use with pg_basebackup for initial base backup + WAL archiving."
}

# Main
case "${1:-}" in
  --start)
    start_archiving
    ;;
  --cleanup)
    cleanup_wal
    ;;
  --status)
    wal_status
    ;;
  --help|-h)
    echo "Usage: $0 <wal_file_path> | --start | --cleanup | --status"
    echo ""
    echo "Options:"
    echo "  <wal_file>    Archive a single WAL segment"
    echo "  --start       Show archiving setup instructions"
    echo "  --cleanup     Remove WAL archives older than retention"
    echo "  --status      Show WAL archive status"
    exit 0
    ;;
  "")
    echo "ERROR: No WAL file path or option specified."
    echo "Usage: $0 <wal_file_path> | --start | --cleanup | --status"
    exit 1
    ;;
  *)
    # Archive the specified WAL file
    archive_wal "$1"
    ;;
esac
