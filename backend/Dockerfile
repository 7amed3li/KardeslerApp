FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/

RUN pnpm install --frozen-lockfile --filter @kardesler/shared --filter @kardesler/backend

COPY packages/shared packages/shared
COPY backend backend

RUN pnpm --filter @kardesler/shared build && pnpm --filter @kardesler/backend build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/

RUN pnpm install --frozen-lockfile --prod --filter @kardesler/shared --filter @kardesler/backend

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/backend/dist backend/dist

USER node
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "backend/dist/src/main.js"]

