#!/bin/bash
# ==============================================================================
# DOC-010 §10.5 — Post-Deployment Health Check
# ==============================================================================
# Verifies that the API is responsive after deployment.
# Usage: ./health-check.sh <api_url> <environment>
#
# Route: /health — the root-mounted health controller (H-1/DEPLOY-001, H-2/DEPLOY-002);
# the old prefixed route does not exist. An empty URL skips the check with exit 0.
# Exit codes:
#   0 — Health check passed
#   1 — Health check failed after max retries
# ==============================================================================

set -euo pipefail

API_URL="${1:-}"
ENVIRONMENT="${2:-unknown}"
MAX_RETRIES=10
RETRY_INTERVAL=5
HEALTH_ENDPOINT="/health"

echo "[health-check] Environment: ${ENVIRONMENT}"
echo "[health-check] Target: ${API_URL}${HEALTH_ENDPOINT}"
echo "[health-check] Max retries: ${MAX_RETRIES}, interval: ${RETRY_INTERVAL}s"
echo ""

if [ -z "$API_URL" ]; then
  echo "[health-check] No API URL provided, skipping health check."
  exit 0
fi

for attempt in $(seq 1 $MAX_RETRIES); do
  echo "[health-check] Attempt ${attempt}/${MAX_RETRIES}..."

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 5 \
    --max-time 10 \
    "${API_URL}${HEALTH_ENDPOINT}" 2>/dev/null || echo "000")

  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[health-check] PASS — API responded with HTTP ${HTTP_STATUS} on attempt ${attempt}"
    exit 0
  fi

  echo "[health-check] HTTP ${HTTP_STATUS} — retrying in ${RETRY_INTERVAL}s..."
  sleep $RETRY_INTERVAL
done

echo "[health-check] FAIL — API did not respond with HTTP 200 after ${MAX_RETRIES} attempts"
exit 1
