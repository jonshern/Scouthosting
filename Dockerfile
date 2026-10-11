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
# when no query runs. Fly's build env doesn't carry runtime secrets,
# so feed a syntactically-valid placeholder. The real DATABASE_URL is
# injected at runtime via Fly secrets.
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
# scripts/migrate.sh runs as the GCP migrate job (infra/).
COPY --from=builder --chown=compass:compass /app/scripts ./scripts

USER compass

EXPOSE 3000

# Cheap liveness probe — doesn't touch the DB so a Postgres blip
# doesn't restart the node.
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run pending migrations on boot, then start Next. `prisma migrate
# deploy` is idempotent — multi-instance roll-outs converge. (fly.io uses
# this; on GCP, Cloud Run overrides it to `npm run start` and migrations
# run as a separate job.)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
