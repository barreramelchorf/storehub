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

# --- Build (compile all TS to JS) ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .
# Compile with tsx (handles all TS files including workspace packages)
RUN npx tsx --tsconfig apps/api/tsconfig.json -e "console.log('warmup')" 2>/dev/null || true
# Use esbuild to bundle the API into a single JS file (fast, no runtime TS compilation needed)
RUN npx esbuild apps/api/src/server.ts --bundle --platform=node --target=node20 --outfile=apps/api/dist/server.mjs --format=esm --packages=external --loader:.ts=ts

# --- Production ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --from=build /app/apps/api/dist/server.mjs ./apps/api/dist/server.mjs
COPY packages/db/migrations ./packages/db/migrations
COPY package.json ./

EXPOSE 3001
USER node
CMD ["node", "apps/api/dist/server.mjs"]

# --- Dev (hot-reload) ---
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3001
CMD ["pnpm", "--filter", "@storehub/api", "dev"]
