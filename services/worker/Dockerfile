FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/worker/ ./services/worker/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autodidact/worker... build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/worker/dist ./services/worker/dist
COPY --from=builder /app/services/worker/package.json ./services/worker/package.json
WORKDIR /app/services/worker
CMD ["node", "dist/main.js"]
