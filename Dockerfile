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

COPY --from=deps --chown=compass:compass /app/node_modules ./node_modules
COPY --from=deps --chown=compass:compass /app/prisma ./prisma
COPY --chown=compass:compass package.json package-lock.json ./
COPY --chown=compass:compass server ./server
COPY --chown=compass:compass lib ./lib
# Apex static assets. Each new top-level *.html / *.css / *.js needs
# to be added here — Express serves these as the marketing/login surface.
# script.js is the login form's submit handler; tokens.css holds every
# CSS custom property the rest of the stylesheet reads. Missing either
# silently breaks the apex experience (login button no-ops, palette
# tokens fall back, fonts go to system defaults).
COPY --chown=compass:compass \
  index.html signup.html login.html security.html \
  pitch.html plans.html positioning.html \
  styles.css security.css tokens.css \
  script.js \
  ./

RUN chown -R compass:compass /app
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
