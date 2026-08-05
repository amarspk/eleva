#!/bin/bash
set -euo pipefail

echo "=== Zayjar API Build for Render ==="
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "PWD: $(pwd)"
echo "Disk space:"
df -h / 2>/dev/null || true
echo ""

echo "=== Step 1: Install pnpm ==="
npm install -g pnpm@10
echo "pnpm version: $(pnpm --version)"

echo "=== Step 2: Install dependencies ==="
pnpm install --frozen-lockfile
echo "Dependencies installed."

echo "=== Step 3: Generate Prisma client ==="
cd packages/db
npx prisma generate
echo "Prisma client generated."
cd ../..

echo "=== Step 4: Build @zayjar/types ==="
cd packages/types
npx tsc
echo "@zayjar/types built."
cd ../..

echo "=== Step 5: Build @zayjar/db (includes copy-generated-client) ==="
cd packages/db
npx tsc
node scripts/copy-generated-client.js
echo "@zayjar/db built."
cd ../..

echo "=== Step 6: Build API ==="
cd apps/api
npx tsc
echo "API built successfully."
cd ../..

echo "=== Build Complete ==="
ls -la apps/api/dist/main.js
