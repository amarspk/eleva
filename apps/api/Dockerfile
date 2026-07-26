# ==========================================
# STAGE 1: DEPENDENCIES INSTALLATION
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Enable pnpm package manager
RUN npm install -g pnpm

# Copy workspace package manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/

# Fetch development dependencies
RUN pnpm install --frozen-lockfile

# ==========================================
# STAGE 2: COMPILE SOURCE BUILDERS
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules

COPY . .

# Generate Prisma database client mapping
RUN pnpm --filter @zayjar/db run prisma:generate

# Build the complete TypeScript stack
RUN pnpm run build

# Strip development modules to reduce container size
RUN pnpm install --prod --frozen-lockfile

# ==========================================
# STAGE 3: MINIMAL RUNTIME CONTAINER
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 node_api && adduser --system --uid 1001 node_api

# Copy compiled binaries and node modules
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/db ./packages/db

# DOC-006 §5.9: Entrypoint script for AWS Secrets Manager integration
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER node_api
EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
