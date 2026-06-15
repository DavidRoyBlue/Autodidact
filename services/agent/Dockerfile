FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/agent/ ./services/agent/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autodidact/agent... build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/agent/dist ./services/agent/dist
COPY --from=builder /app/services/agent/package.json ./services/agent/package.json
WORKDIR /app/services/agent
CMD ["node", "dist/main.js"]
