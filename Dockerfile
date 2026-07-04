FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/secrets/package.json packages/secrets/
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/web/ apps/web/
COPY packages/db/ packages/db/
COPY packages/secrets/ packages/secrets/
RUN pnpm --filter @nanomail/web build

# Production
FROM base AS production
COPY --from=build /app/apps/web/.output .output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
