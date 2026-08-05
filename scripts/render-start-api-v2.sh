#!/bin/bash
set -uo pipefail

echo "=== Zayjar API Start ==="
echo "Node version: $(node --version)"
echo "PWD: $(pwd)"
echo "PORT: ${PORT:-not set}"
echo "NODE_ENV: ${NODE_ENV:-not set}"
echo "DATABASE_URL set: $([ -n "${DATABASE_URL:-}" ] && echo 'yes' || echo 'NO')"
echo "JWT_SECRET set: $([ -n "${JWT_SECRET:-}" ] && echo 'yes' || echo 'NO')"
echo "JWT_REFRESH_SECRET set: $([ -n "${JWT_REFRESH_SECRET:-}" ] && echo 'yes' || echo 'NO')"
echo "REDIS_URL: ${REDIS_URL:-not set}"
echo "ENABLE_SOCKET_IO: ${ENABLE_SOCKET_IO:-not set}"
echo "ENABLE_BACKGROUND_JOBS: ${ENABLE_BACKGROUND_JOBS:-not set}"
echo ""

# Run Prisma migrations at startup (before app starts)
echo "=== Running Prisma Migrations ==="
cd packages/db
npx prisma migrate deploy 2>&1 || echo "WARNING: Migration failed, continuing anyway"
cd ../..

echo "=== Starting API ==="
exec node --max-old-space-size=384 apps/api/dist/main.js
