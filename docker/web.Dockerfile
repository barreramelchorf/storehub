# --- Base ---
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/
COPY packages/schemas/package.json packages/schemas/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile --prod=false

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/schemas/node_modules ./packages/schemas/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=__NEXT_PUBLIC_API_URL_PLACEHOLDER__
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @storehub/web build

# --- Production (standalone) ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY docker/web-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R node:node /app/apps/web/.next

EXPOSE 3000
USER node
CMD ["/app/entrypoint.sh"]

# --- Dev (hot-reload) ---
FROM base AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "--filter", "@storehub/web", "dev"]
