# Multi-stage build for compass-next (Next.js 16). The legacy Express
# app in server/ is no longer the runtime — compass-next is the
# single deploy target as of the cutover.
#
# Build:  docker build -t compass:latest .
# Run:    docker run --rm -p 3000:3000 --env-file .env compass:latest

FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Copy the parent repo (for prisma/schema.prisma + migrations that
# compass-next's prisma/ symlinks to) and the compass-next package.
# The whole repo lands at /app per .dockerignore. compass-next/prisma
# is a relative symlink to ../../prisma so the schema resolves once
# everything's in place.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY compass-next/package.json compass-next/package-lock.json ./compass-next/
COPY compass-next/prisma ./compass-next/prisma

# Install + generate inside compass-next. The Next/Prisma client lands
# in /app/compass-next/node_modules.
WORKDIR /app/compass-next
RUN npm ci --include=optional && npx prisma generate

# ---------------------------------------------------------------------

FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Bring forward the resolved deps + generated Prisma client.
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/compass-next/node_modules ./compass-next/node_modules

# Source for the build context.
COPY compass-next ./compass-next

# Next produces .next/ and (in standalone mode if configured) a
# server bundle. Default mode emits .next/ which `next start` reads.
WORKDIR /app/compass-next
RUN npm run build

# ---------------------------------------------------------------------

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV LOG_LEVEL=info

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Non-root runtime user. /app/var/uploads is the writable local-storage
# root when STORAGE_DRIVER=local; mount a Fly volume / S3 / GCS in
# production via STORAGE_DRIVER.
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 compass \
  && mkdir -p /app/var/uploads /app/var/tmp \
  && chown -R compass:compass /app/var

# Bring in the parent prisma schema + migrations (used by `prisma
# migrate deploy` at boot) and the built Next app.
COPY --from=builder --chown=compass:compass /app/prisma ./prisma
COPY --from=builder --chown=compass:compass /app/compass-next ./compass-next

USER compass
WORKDIR /app/compass-next

EXPOSE 3000

# Cheap liveness probe (no DB touch).
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run pending migrations on boot, then start Next. prisma migrate
# deploy is idempotent — safe under multi-instance rollouts.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
