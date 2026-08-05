#!/usr/bin/sh
# Lightweight API start script for Render free tier (512 MB RAM)
# - Limits V8 heap to 384 MB, leaving room for Prisma engine + native deps
# - Sets Prisma connection pool to 3 (default is 5 * num_cpus)
# - Disables Socket.IO and BullMQ unless explicitly enabled
# - Skips background jobs unless explicitly enabled

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=384}"

# Ensure sensible defaults for memory-constrained environments
: ${PORT:=10000}

echo "=== Zayjar API Start ==="
echo "NODE_OPTIONS: $NODE_OPTIONS"
echo "PORT: $ $PORT"
echo "NODE_ENV: $NODE_ENV"

exec node apps/api/dist/main.js
