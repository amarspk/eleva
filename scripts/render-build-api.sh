#!/bin/bash
set -euo pipefail

# Render build script for the API service
# Working directory: repo root (render.yaml sets rootDir)

echo "=== Zayjar API Render Build ==="

# Install pnpm
npm install -g pnpm@10

# Install all dependencies (monorepo)
pnpm install --frozen-lockfile

# Generate Prisma client
cd packages/db
npx prisma generate
cd ../..

# Build API only
cd apps/api
npx tsc
cd ../..

echo "=== Build Complete ==="
