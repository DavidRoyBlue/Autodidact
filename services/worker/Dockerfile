FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/ ./packages/
COPY services/worker/ ./services/worker/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @autodidact/worker... build
# Assemble a self-contained production bundle: a real (de-symlinked) node_modules
# with prod deps + built workspace packages. Copying the pnpm-symlinked tree into
# the runtime image does not work — deps live in per-package node_modules/.pnpm.
RUN pnpm --filter @autodidact/worker deploy --prod /app/deploy

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/deploy ./
EXPOSE 8080
CMD ["node", "dist/main.js"]
