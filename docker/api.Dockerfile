# --- Base ---
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/schemas/package.json packages/schemas/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --prod=false

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .
RUN pnpm --filter @storehub/api build

# --- Production ---
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY apps/api/src ./apps/api/src
COPY apps/api/package.json apps/api/
COPY packages/db/src ./packages/db/src
COPY packages/db/package.json packages/db/
COPY packages/db/migrations ./packages/db/migrations
COPY packages/schemas/src ./packages/schemas/src
COPY packages/schemas/package.json packages/schemas/
COPY packages/types/src ./packages/types/src
COPY packages/types/package.json packages/types/
COPY package.json pnpm-workspace.yaml ./

EXPOSE 3001
USER node
CMD ["npx", "tsx", "apps/api/src/server.ts"]

# --- Dev (hot-reload) ---
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@storehub/api", "dev"]
