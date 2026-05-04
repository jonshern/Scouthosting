# Multi-stage build. The runtime image is slim (no build tools, no
# devDependencies) and runs as a non-root user. Works for Cloud Run,
# Fly, ECS, and a self-hosted docker compose.
#
# Build:  docker build -t compass:latest .
# Run:    docker run --rm -p 8080:8080 --env-file .env compass:latest

FROM node:22-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=optional && npx prisma generate

# ---------------------------------------------------------------------

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV LOG_LEVEL=info

# wget is used by the HEALTHCHECK below; openssl + ca-certificates are
# needed for outbound HTTPS (Resend, Twilio, Stripe).
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

# Non-root runtime user. /app/var is the writable upload root (point
# STORAGE_DIR elsewhere to mount a volume).
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 compass \
  && mkdir -p /app/var/uploads /app/var/tmp

# node_modules + the prisma client come from the deps stage (cached
# across builds because they're versioned by package-lock + schema).
COPY --from=deps --chown=compass:compass /app/node_modules ./node_modules
COPY --from=deps --chown=compass:compass /app/prisma ./prisma

# Everything else ships from the build context. .dockerignore is the
# single source of truth for what's excluded — anything not listed
# there gets copied in, so adding a new top-level file or directory
# (admin/, demo/, a new marketing.html, etc.) is automatically picked
# up. Replaces the previous explicit per-file COPY list that kept
# biting us as trap #1 in CLAUDE.md (each new asset silently 404'd
# in prod until someone re-edited this file).
COPY --chown=compass:compass . .

USER compass

EXPOSE 8080

# Cheap liveness probe — does NOT touch the DB so a Postgres blip
# doesn't restart the node. Use /readyz from your orchestrator for
# traffic-shedding (it does check Postgres).
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

# Run pending migrations on boot, then start the server. `prisma
# migrate deploy` is idempotent — multi-instance roll-outs converge.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
