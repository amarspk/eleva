#!/bin/bash
# ==============================================================================
# DOC-010 §10.5 — Automated Rollback Procedure
# ==============================================================================
# Rolls back to the previous stable image tag.
# Usage: ./rollback.sh <environment> <api_url>
#
# Strategy: Identifies the previous successful deployment tag and redeploys.
# For Kubernetes (primary): kubectl rollout undo on the five application workloads.
# For ECS: uses aws ecs update-service to force new deployment with previous task def.
# For Docker Compose: pulls the previous tag and restarts services.
#
# Exit codes:
#   0 — Rollback completed
#   1 — Rollback failed or not configured
# ==============================================================================

set -euo pipefail

ENVIRONMENT="${1:?Usage: rollback.sh <environment> <api_url>}"
API_URL="${2:-}"

echo "[rollback] Environment: ${ENVIRONMENT}"
echo "[rollback] Strategy: Revert to previous stable deployment"
echo ""

# ==========================================
# Kubernetes Rollback (primary strategy — repo's actual k8s topology)
# ==========================================
rollback_k8s() {
  local NAMESPACE="zayjar"
  local DEPLOYMENTS=(api worker qr-menu backoffice cashier)

  echo "[rollback] Attempting Kubernetes rollback in namespace: ${NAMESPACE}"

  if ! command -v kubectl &> /dev/null; then
    echo "[rollback] kubectl not installed, skipping Kubernetes rollback."
    return 1
  fi

  if [ -z "${KUBECONFIG:-}" ]; then
    echo "[rollback] KUBECONFIG not set, skipping Kubernetes rollback."
    return 1
  fi

  for DEPLOY in "${DEPLOYMENTS[@]}"; do
    kubectl -n "${NAMESPACE}" rollout undo "deployment/${DEPLOY}"
  done

  kubectl -n "${NAMESPACE}" rollout status deployment/api --timeout=300s

  echo "[rollback] Kubernetes rollback completed."
}

# ==========================================
# ECS Fargate Rollback (when AWS CLI available)
# ==========================================
rollback_ecs() {
  local SERVICE_NAME="zayjar-api-${ENVIRONMENT}"
  local CLUSTER_NAME="zayjar-${ENVIRONMENT}"

  echo "[rollback] Attempting ECS rollback for service: ${SERVICE_NAME}"

  if ! command -v aws &> /dev/null; then
    echo "[rollback] AWS CLI not installed, skipping ECS rollback."
    return 1
  fi

  # Get current task definition
  CURRENT_TD=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --query 'services[0].taskDefinition' \
    --output text 2>/dev/null || echo "")

  if [ -z "$CURRENT_TD" ]; then
    echo "[rollback] Could not fetch current task definition."
    return 1
  fi

  # Get previous task definition (revision - 1)
  CURRENT_REV=$(echo "$CURRENT_TD" | grep -o '[0-9]*$')
  PREV_REV=$((CURRENT_REV - 1))
  PREV_TD=$(echo "$CURRENT_TD" | sed "s/${CURRENT_REV}/${PREV_REV}/")

  echo "[rollback] Current: ${CURRENT_TD}"
  echo "[rollback] Rolling back to: ${PREV_TD}"

  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --task-definition "$PREV_TD" \
    --force-new-deployment \
    --query 'service.serviceName' \
    --output text

  echo "[rollback] ECS rollback initiated."
}

# ==========================================
# Docker Compose Rollback (fallback)
# ==========================================
rollback_compose() {
  echo "[rollback] Attempting Docker Compose rollback..."

  if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "[rollback] Docker Compose not available."
    return 1
  fi

  # Tag current as failed, pull previous latest
  echo "[rollback] Tagging current image as rollback-candidate..."
  docker tag "zayjar/api:latest" "zayjar/api:rollback-${ENVIRONMENT}-$(date +%s)" 2>/dev/null || true

  echo "[rollback] Pulling previous stable image..."
  docker pull "zayjar/api:previous" 2>/dev/null || {
    echo "[rollback] No 'previous' tag available. Manual intervention required."
    return 1
  }

  echo "[rollback] Restarting services with previous image..."
  COMPOSE_FILE="docker-compose.yml"
  if [ -f "docker-compose.${ENVIRONMENT}.yml" ]; then
    COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"
  fi

  docker-compose -f "$COMPOSE_FILE" up -d --force-recreate api-core 2>/dev/null || \
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate api-core

  echo "[rollback] Docker Compose rollback completed."
}

# ==========================================
# Main Rollback Logic
# ==========================================
echo "[rollback] Selecting rollback strategy..."

if command -v kubectl &> /dev/null && [ -n "${KUBECONFIG:-}" ]; then
  rollback_k8s
elif command -v aws &> /dev/null && [ -n "${AWS_DEFAULT_REGION:-}" ]; then
  rollback_ecs
elif command -v docker &> /dev/null; then
  rollback_compose
else
  echo "[rollback] No rollback strategy available."
  echo "[rollback] Manual intervention required."
  echo "[rollback] Steps:"
  echo "  1. Kubernetes: kubectl -n zayjar rollout undo deployment/<app>"
  echo "  2. Or redeploy with: docker-compose up -d --force-recreate api-core"
  echo "  3. Or update ECS service with previous task definition"
  exit 1
fi

echo "[rollback] Rollback procedure completed for ${ENVIRONMENT}."
