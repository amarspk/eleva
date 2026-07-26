#!/bin/sh
# ==============================================================================
# DOC-006 §5.9 — Docker Entrypoint for AWS Secrets Manager Integration
# ==============================================================================
# This script checks if AWS Secrets Manager is configured and pre-fetches
# AWS credentials if needed. The actual secret injection happens inside the
# Node.js application at startup via SecretsManagerService.
#
# For ECS deployments with IAM Task Execution Role, no additional configuration
# is needed — the SDK authenticates via the task role automatically.
#
# For local development, this script is a no-op and the app uses .env values.
# ==============================================================================

set -e

echo "[entrypoint] Starting Zayjar API..."

# Verify critical environment variables are set
if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] WARNING: DATABASE_URL is not set. The application may fail to connect to the database."
fi

if [ -z "$REDIS_URL" ]; then
  echo "[entrypoint] WARNING: REDIS_URL is not set. The application may fail to connect to Redis."
fi

# If AWS Secrets Manager is configured, log it
if [ -n "$AWS_SECRETS_MANAGER_SECRET_ID" ]; then
  echo "[entrypoint] AWS Secrets Manager configured: $AWS_SECRETS_MANAGER_SECRET_ID"
  echo "[entrypoint] Secrets will be fetched at application startup."
else
  echo "[entrypoint] AWS Secrets Manager not configured. Using environment variables."
fi

# Execute whatever command was passed (from CMD or docker-compose override)
exec "$@"
