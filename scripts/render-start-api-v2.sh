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

# Ensure subscription plans exist (needed for tenant onboarding)
echo "=== Ensuring Subscription Plans ==="
node scripts/seed-plans.js 2>&1 || echo "WARNING: Plan seeding failed, continuing anyway"

# Run full seed if explicitly requested (set RUN_SEED=true in env to enable on first deploy)
if [ "${RUN_SEED:-}" = "true" ]; then
  echo "=== Running Database Seed ==="
  cd packages/db
  # Try compiled seed first, fall back to ts-node
  if [ -f dist/seed/prisma/seed.js ]; then
    echo "Using compiled seed (dist/seed/prisma/seed.js)"
    node dist/seed/prisma/seed.js 2>&1
    SEED_EXIT=$?
  else
    echo "Using ts-node seed"
    npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts 2>&1
    SEED_EXIT=$?
  fi
  if [ $SEED_EXIT -ne 0 ]; then
    echo "WARNING: Seed failed with exit code $SEED_EXIT, continuing anyway"
  else
    echo "Seed completed successfully."
  fi
  cd ../..
fi

echo "=== Starting API ==="
exec node --max-old-space-size=384 apps/api/dist/main.js
# Build 2026-08-06T13:16:27Z
