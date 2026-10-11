# Multi-stage build for the Next.js app at the repo root.
#
# Build:  docker build -t compass:latest .
# Run:    docker run --rm -p 3000:3000 --env-file .env compass:latest

FROM node:22-trixie-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=optional && npx prisma generate

# ---------------------------------------------------------------------

FROM node:22-trixie-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# Next.js "Collecting page data" instantiates modules that import the
# Prisma client. PrismaClient constructor demands DATABASE_URL even
# when no query runs. The build has no runtime secrets, so feed a
# syntactically-valid placeholder. The real DATABASE_URL is injected at
# runtime (Secret Manager on Cloud Run, an env file locally).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN npm run build

# ---------------------------------------------------------------------

FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV LOG_LEVEL=info

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# The base image's global npm bundles its own dependencies
# (brace-expansion, ip-address, picomatch, sigstore, ...) and their CVEs,
# which upgrading npm doesn't clear. Nothing at runtime needs npm or npx:
# CMD, scripts/migrate.sh and the seed call node_modules/.bin directly.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Non-root runtime user. /app/var/uploads is the writable local-storage
# root when STORAGE_DRIVER=local; use S3 or GCS via STORAGE_DRIVER for
# real persistence in production.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 compass \
  && mkdir -p /app/var/uploads /app/var/tmp \
  && chown -R compass:compass /app/var

COPY --from=builder --chown=compass:compass /app/node_modules ./node_modules
COPY --from=builder --chown=compass:compass /app/.next ./.next
COPY --from=builder --chown=compass:compass /app/prisma ./prisma
COPY --from=builder --chown=compass:compass /app/package.json ./package.json
COPY --from=builder --chown=compass:compass /app/next.config.ts ./next.config.ts
# scripts/migrate.sh runs as the GCP migrate job (infra/). node_modules
# keeps devDependencies so prisma (migrations) and tsx (seed:
# `node_modules/.bin/tsx prisma/seed.ts`) are available in the image.
COPY --from=builder --chown=compass:compass /app/scripts ./scripts

USER compass

EXPOSE 3000

# Cheap liveness probe — doesn't touch the DB so a Postgres blip
# doesn't restart the node.
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start Next only. Migrations are a separate step, run before the new
# image takes traffic: scripts/migrate.sh (the core-migrate-<env> Cloud
# Run job on GCP; run it by hand with the same image elsewhere).
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
