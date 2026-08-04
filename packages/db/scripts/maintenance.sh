#!/usr/bin/env bash
# ==============================================================================
# DOC-010 §9.2 — Database Maintenance & Profiling Orchestrator
# ==============================================================================
# Runs database health checks, profiling, and maintenance tasks.
#
# Usage:
#   ./packages/db/scripts/maintenance.sh [--profile] [--health] [--optimize] [--all]
#
# Environment:
#   DATABASE_URL  — PostgreSQL connection string (required)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$(cd "$SCRIPT_DIR/../config" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

usage() {
  cat <<EOF
DOC-010 §9.2 — Database Maintenance Tool

Usage: $0 [OPTIONS]

Options:
  --health     Run health checks (dead tuples, index usage, bloat)
  --profile    Run EXPLAIN ANALYZE profiling on hot-path queries
  --optimize   Apply per-table autovacuum tuning overrides
  --all        Run all tasks in order: health → optimize → profile
  --dry-run    Show SQL statements without executing
  -h, --help   Show this help message

Environment:
  DATABASE_URL  PostgreSQL connection string (required)

Examples:
  $0 --health
  $0 --all --dry-run
  DATABASE_URL="postgresql://..." $0 --profile
EOF
}

check_prerequisites() {
  if [ -z "${DATABASE_URL:-}" ]; then
    log_error "DATABASE_URL is not set. Export it before running."
    exit 1
  fi

  if ! command -v psql &> /dev/null; then
    log_error "psql client not found. Install postgresql-client."
    exit 1
  fi

  log_info "Connecting to database..."
  if ! psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
    log_error "Cannot connect to database. Check DATABASE_URL."
    exit 1
  fi
  log_info "Database connection verified."
}

run_health_checks() {
  log_info "Running database health checks..."
  psql "$DATABASE_URL" -f "$SCRIPT_DIR/db-health-checks.sql"
  echo ""
}

run_profiling() {
  log_info "Running EXPLAIN ANALYZE profiling..."
  log_warn "This runs real queries against the database. Use staging."
  psql "$DATABASE_URL" -f "$SCRIPT_DIR/query-profiling.sql"
  echo ""
}

run_optimize() {
  log_info "Applying per-table autovacuum tuning..."
  psql "$DATABASE_URL" -f "$SCRIPT_DIR/optimize-tables.sql"
  echo ""
}

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
RUN_HEALTH=false
RUN_PROFILE=false
RUN_OPTIMIZE=false
DRY_RUN=false

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --health)    RUN_HEALTH=true ;;
    --profile)   RUN_PROFILE=true ;;
    --optimize)  RUN_OPTIMIZE=true ;;
    --all)       RUN_HEALTH=true; RUN_OPTIMIZE=true; RUN_PROFILE=true ;;
    --dry-run)   DRY_RUN=true ;;
    -h|--help)   usage; exit 0 ;;
    *)           log_error "Unknown option: $1"; usage; exit 1 ;;
  esac
  shift
done

# ---------------------------------------------------------------------------
# Execute
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = true ]; then
  log_warn "Dry-run mode: showing SQL without executing."
  if [ "$RUN_HEALTH" = true ]; then
    log_info "Health checks SQL:"
    cat "$SCRIPT_DIR/db-health-checks.sql"
  fi
  if [ "$RUN_OPTIMIZE" = true ]; then
    log_info "Optimization SQL:"
    cat "$SCRIPT_DIR/optimize-tables.sql"
  fi
  if [ "$RUN_PROFILE" = true ]; then
    log_info "Profiling SQL:"
    cat "$SCRIPT_DIR/query-profiling.sql"
  fi
  exit 0
fi

check_prerequisites

if [ "$RUN_HEALTH" = true ]; then
  run_health_checks
fi

if [ "$RUN_OPTIMIZE" = true ]; then
  run_optimize
fi

if [ "$RUN_PROFILE" = true ]; then
  run_profiling
fi

log_info "Maintenance tasks completed."
