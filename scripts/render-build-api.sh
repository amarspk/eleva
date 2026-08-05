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

echo "=== Step 7: Compile seed script ==="
cd packages/db
npx tsc --outDir dist/seed --rootDir . prisma/seed.ts --esModuleInterop --module CommonJS --moduleResolution Node --target ES2022 --skipLibCheck --strict false 2>&1 || echo "WARNING: Seed compilation failed, seed will not be available"
if [ -f dist/seed/prisma/seed.js ]; then
  # Fix require path: compiled seed is at dist/seed/prisma/seed.js and references
  # ../src/generated-client which resolves to dist/seed/src/generated-client (wrong).
  # The generated-client is at src/generated-client (2 dirs up from dist/seed/prisma/).
  sed -i 's|require("../src/generated-client")|require("../../src/generated-client")|g' dist/seed/prisma/seed.js
  echo "Seed compiled successfully (require path fixed)."
else
  echo "WARNING: Compiled seed not found at dist/seed/prisma/seed.js"
fi
cd ../..

echo "=== Build Complete ==="
ls -la apps/api/dist/main.js
