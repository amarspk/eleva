#!/bin/bash
set -uo pipefail

echo "=== Zayjar API Start ==="
echo "Node version: $(node --version)"

# Run Prisma migrations at startup
echo "=== Running Prisma Migrations ==="
cd packages/db
npx prisma migrate deploy 2>&1 || echo "WARNING: Migration failed, continuing anyway"
cd ../..

# Seed permissions (idempotent - safe to run on every deploy)
echo "=== Seeding Permissions ==="
node scripts/seed-permissions.js 2>&1 || echo "WARNING: Permission seeding failed, continuing anyway"

# Ensure subscription plans exist
echo "=== Ensuring Subscription Plans ==="
node scripts/seed-plans.js 2>&1 || echo "WARNING: Plan seeding failed, continuing anyway"

echo "=== Starting API ==="
exec node --max-old-space-size=384 apps/api/dist/main.js
