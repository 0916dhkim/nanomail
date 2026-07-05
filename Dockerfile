FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Install all workspace dependencies (web + worker + packages)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/secrets/package.json packages/secrets/
RUN pnpm install --frozen-lockfile

# Build backend
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
COPY packages/db/ packages/db/
COPY packages/secrets/ packages/secrets/
RUN pnpm --filter @nanomail/web build

# Production backend
FROM base AS production
COPY --from=build /app/apps/web/.output .output
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD node -e "fetch('http://localhost:3000/api/ingest').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]

# Migrator (one-shot: fetch DATABASE_URL from secret-party, run migrations)
FROM deps AS migrator
COPY tsconfig.base.json ./
COPY packages/db/ packages/db/
COPY packages/secrets/ packages/secrets/
WORKDIR /app/packages/db
CMD ["pnpm", "migrate"]

# Worker deployer (one-shot: sync secrets from secret-party, deploy to Cloudflare)
FROM deps AS worker-deployer
COPY tsconfig.base.json ./
COPY apps/worker/ apps/worker/
COPY packages/secrets/ packages/secrets/
COPY packages/db/ packages/db/
WORKDIR /app/apps/worker
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
