FROM --platform=linux/amd64 node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter @storehub/db

COPY packages/db ./packages/db

CMD sh -c "pnpm --filter @storehub/db migrate && if [ \"$RUN_SEED\" = 'true' ]; then npx tsx packages/db/src/seed.ts; fi"
