FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/ ./packages/
COPY services/api/ ./services/api/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autodidact/api... build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable pnpm
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/api/dist ./services/api/dist
COPY --from=builder /app/services/api/package.json ./services/api/package.json
WORKDIR /app/services/api
CMD ["node", "dist/main.js"]
