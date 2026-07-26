#!/usr/bin/env bash
# ================================================================
# DOC-007 §6.4 — CloudFront Cache Invalidation Script
# Creates invalidation requests for one or more CloudFront paths.
#
# Usage:
#   ./invalidate.sh <distribution-id> <path> [path ...]
#   ./invalidate.sh --dry-run <distribution-id> <path> [path ...]
#
# Examples:
#   ./invalidate.sh E1234ABCDEF /tenants/abc/products/*
#   ./invalidate.sh --dry-run E1234ABCDEF /tenants/abc/products/* /tenants/abc/logo*
#   ./invalidate.sh E1234ABCDEF /*   # wildcard — invalidate everything
# ================================================================

set -euo pipefail

DRY_RUN=false
DISTRIBUTION_ID=""
PATHS=()

# ── Parse arguments ───────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=true
      ;;
    --help|-h)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      if [ -z "$DISTRIBUTION_ID" ]; then
        DISTRIBUTION_ID="$arg"
      else
        PATHS+=("$arg")
      fi
      ;;
  esac
done

# ── Validate inputs ──────────────────────────────────────────
if [ -z "$DISTRIBUTION_ID" ]; then
  echo "Error: CloudFront distribution ID is required." >&2
  echo "Usage: $0 [--dry-run] <distribution-id> <path> [path ...]" >&2
  exit 1
fi

if [ ${#PATHS[@]} -eq 0 ]; then
  echo "Error: At least one invalidation path is required." >&2
  echo "Usage: $0 [--dry-run] <distribution-id> <path> [path ...]" >&2
  exit 1
fi

# ── Build JSON batch paths array ─────────────────────────────
JSON_PATHS="["
for i in "${!PATHS[@]}"; do
  if [ $i -gt 0 ]; then
    JSON_PATHS+=","
  fi
  JSON_PATHS+="\"${PATHS[$i]}\""
done
JSON_PATHS+="]"

# ── Execute or preview ───────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would create invalidation for distribution: $DISTRIBUTION_ID"
  echo "[DRY RUN] Paths:"
  for p in "${PATHS[@]}"; do
    echo "  - $p"
  done
  echo "[DRY RUN] JSON payload: {\"Paths\": {\"Quantity\": ${#PATHS[@]}, \"Items\": $JSON_PATHS}, \"CallerReference\": \"$(date +%s)\"}"
  exit 0
fi

CALLER_REF="zayjar-$(date +%s)-$$"

INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --invalidation-batch "{
    \"Paths\": {
      \"Quantity\": ${#PATHS[@]},
      \"Items\": $JSON_PATHS
    },
    \"CallerReference\": \"$CALLER_REF\"
  }" \
  --query 'Invalidation.Id' \
  --output text)

echo "$INVALIDATION_ID"
