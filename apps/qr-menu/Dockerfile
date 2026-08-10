# ==========================================
# STAGE 1: DEPENDENCIES
# ==========================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/qr-menu/package.json ./apps/qr-menu/
COPY packages/types/package.json ./packages/types/
RUN pnpm install --frozen-lockfile

# ==========================================
# STAGE 2: BUILDER
# ==========================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/qr-menu/node_modules ./apps/qr-menu/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .
# The frontends import @zayjar/types (shared enums) from its dist output —
# build it before the app build, otherwise `next build` fails with
# "Cannot find module '@zayjar/types'".
RUN pnpm --filter @zayjar/types build
RUN pnpm --filter @zayjar/qr-menu build

# ==========================================
# STAGE 3: RUNNER
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nextjs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/apps/qr-menu/.next ./apps/qr-menu/.next
COPY --from=builder /app/apps/qr-menu/package.json ./apps/qr-menu/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/qr-menu/node_modules ./apps/qr-menu/node_modules
USER nextjs
EXPOSE 3000
CMD ["pnpm", "--filter", "@zayjar/qr-menu", "start"]
