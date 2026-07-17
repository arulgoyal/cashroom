# syntax=docker/dockerfile:1
# ── Build stage: compile TS → JS with full (dev) deps ──────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage: prod deps only + compiled output ───────────────────────────
# NOTE: DB migrations are NOT run here. This image runs the compiled app only;
# migrations are applied from the host (or a one-off job) via `npm run
# migration:run`, which needs ts-node + src that this lean image omits.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
