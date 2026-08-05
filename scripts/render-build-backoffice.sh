#!/bin/bash
set -euo pipefail

# Render build script for the Backoffice service
# Working directory: repo root

echo "=== Zayjar Backoffice Render Build ==="

# Install pnpm
npm install -g pnpm@10

# Install all dependencies (monorepo)
pnpm install --frozen-lockfile

# Build backoffice only
cd apps/backoffice
npx next build
cd ../..

echo "=== Build Complete ==="
