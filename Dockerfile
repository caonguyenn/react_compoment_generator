# Base stage
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Dev stage (supports running Vite servers at runtime)
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/designs/_shared /app/scripts
EXPOSE 3000
# Init script installs shared deps then starts Next.js
CMD ["/app/scripts/init-designs.sh"]

# Production build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# Production stage
FROM node:20-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN mkdir -p /app/designs/_shared /app/scripts
EXPOSE 3000
CMD ["/app/scripts/init-designs.sh"]
