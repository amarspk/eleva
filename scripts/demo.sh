#!/usr/bin/env bash
#
# demo.sh — Start the complete Zayjar local demo environment.
#
# Usage:  bash scripts/demo.sh
#
# Starts:
#   - PostgreSQL (local, port 5432)
#   - API server  (port 8000)
#   - Backoffice  (port 3001, proxies /api/* to API)
#
# First run automatically seeds the database with demo data.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_URL="postgresql://zayjar:zayjar_local@localhost:5432/zayjar_local"

echo "╔══════════════════════════════════════════════════╗"
echo "║       Zayjar Platform — Local Demo Environment    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Ensure PostgreSQL is running ─────────────────────────────────────
echo "▸ Checking PostgreSQL..."
if ! pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  echo "  Starting PostgreSQL..."
  sudo service postgresql start 2>/dev/null || sudo pg_ctlcluster 15 main start 2>/dev/null
  sleep 2
fi

# Ensure database and user exist
sudo -u postgres psql -qtAc "SELECT 1 FROM pg_roles WHERE rolname='zayjar'" 2>/dev/null | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER zayjar WITH PASSWORD 'zayjar_local';" 2>/dev/null

sudo -u postgres psql -lqt 2>/dev/null | cut -d\| -f1 | grep -qw zayjar_local || \
  sudo -u postgres psql -c "CREATE DATABASE zayjar_local OWNER zayjar;" 2>/dev/null

echo "  PostgreSQL ✓"

# ── 2. Ensure Prisma schema is applied ──────────────────────────────────
echo "▸ Checking database schema..."
cd "$REPO_ROOT/packages/db"
if ! DATABASE_URL="$DB_URL" npx prisma migrate status 2>/dev/null | grep -q "Database schema is up to date"; then
  echo "  Applying schema (prisma db push)..."
  DATABASE_URL="$DB_URL" npx prisma db push --accept-data-loss 2>&1 | tail -1
fi
echo "  Schema ✓"

# ── 3. Ensure demo data is seeded ───────────────────────────────────────
echo "▸ Checking demo data..."
PERM_COUNT=$(PGPASSWORD=zayjar_local psql -h localhost -U zayjar -d zayjar_local -qtAc "SELECT count(*) FROM permissions" 2>/dev/null || echo "0")
if [ "$PERM_COUNT" -lt 40 ]; then
  echo "  Seeding demo data..."
  cd "$REPO_ROOT"
  DATABASE_URL="$DB_URL" node scripts/seed-demo.js 2>&1 | tail -20
else
  echo "  Demo data already seeded ($PERM_COUNT permissions) ✓"
fi

# ── 4. Ensure dependencies are built ────────────────────────────────────
echo "▸ Checking builds..."
if [ ! -f "$REPO_ROOT/apps/api/dist/main.js" ]; then
  echo "  Building API..."
  cd "$REPO_ROOT/packages/types" && npx tsc 2>&1 | tail -1
  cd "$REPO_ROOT/packages/db" && npx tsc 2>&1 | tail -1 && node scripts/copy-generated-client.js 2>&1
  cd "$REPO_ROOT/apps/api" && npx tsc 2>&1 | tail -1
fi
if [ ! -d "$REPO_ROOT/apps/backoffice/.next" ]; then
  echo "  Building Backoffice..."
  cd "$REPO_ROOT/apps/backoffice" && API_PROXY_TARGET=http://localhost:8000 npx next build 2>&1 | tail -3
fi
echo "  Builds ✓"

# ── 5. Start API server ────────────────────────────────────────────────
echo "▸ Starting API server on port 8000..."
cd "$REPO_ROOT"
# Kill any existing API on port 8000
lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null; sleep 1

DATABASE_URL="$DB_URL" \
JWT_SECRET=zayjar-jwt-secret-local-2026 \
JWT_REFRESH_SECRET=zayjar-refresh-secret-local-2026 \
CORS_ORIGIN="http://localhost:3001" \
REDIS_URL=disabled \
ENABLE_SOCKET_IO=false \
ENABLE_BACKGROUND_JOBS=false \
PORT=8000 \
NODE_ENV=development \
node --max-old-space-size=384 apps/api/dist/main.js &
API_PID=$!
echo "  API PID: $API_PID"

# Wait for API to be ready
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/health 2>/dev/null | grep -q "ok"; then
    break
  fi
  sleep 1
done
echo "  API ✓ (http://localhost:8000)"

# ── 6. Start Backoffice ────────────────────────────────────────────────
echo "▸ Starting Backoffice on port 3001..."
cd "$REPO_ROOT/apps/backoffice"
# Kill any existing Backoffice on port 3001
lsof -ti:3001 2>/dev/null | xargs kill 2>/dev/null; sleep 1

API_PROXY_TARGET=http://localhost:8000 npx next start -p 3001 &
BO_PID=$!
echo "  Backoffice PID: $BO_PID"

sleep 2
echo "  Backoffice ✓ (http://localhost:3001)"

# ── Summary ─────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║          🎉  DEMO READY  🎉                      ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  QR Menu:     http://localhost:3000              ║"
echo "║  Backoffice:  http://localhost:3001              ║"
echo "║  API:         http://localhost:8000              ║"
echo "║  Health:      http://localhost:8000/health       ║"
echo "║                                                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  DEMO ACCOUNTS                                   ║"
echo "║                                                  ║"
echo "║  Platform Owner:                                 ║"
echo "║    platform@zayjar.ai / Platform123!             ║"
echo "║    (No tenant — sees all tenants)                ║"
echo "║                                                  ║"
echo "║  Restaurant Owner (Al-Baik):                     ║"
echo "║    admin@albaik.com / Demo1234!                  ║"
echo "║                                                  ║"
echo "║  Manager (Al-Baik):                              ║"
echo "║    manager@albaik.com / Demo1234!                ║"
echo "║                                                  ║"
echo "║  Cashier (Al-Baik):                              ║"
echo "║    cashier@albaik.com / Demo1234!                ║"
echo "║                                                  ║"
echo "║  Kitchen Staff (Al-Baik):                        ║"
echo "║    kitchen@albaik.com / Demo1234!                ║"
echo "║                                                  ║"
echo "║  Restaurant Owner (Tokyo Ramen):                 ║"
echo "║    admin@tokyoramen.com / Demo1234!              ║"
echo "║                                                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  TENANT IDs (for X-Tenant-ID header)             ║"
echo "║                                                  ║"
echo "║  Al-Baik:     80a00898-782c-4a6e-8bad-880e8f4f7977║"
echo "║  Tokyo Ramen: 930c9c66-06df-4029-8ee8-ac4d0046c6af║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

# Wait for either process to exit
wait $API_PID $BO_PID 2>/dev/null
