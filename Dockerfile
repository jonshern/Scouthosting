# Multi-stage build for Cloud Run.
#
# Stage 1 installs deps (including dev) and runs `prisma generate` so the
# generated client lands in node_modules. Stage 2 is a slim runtime that
# copies node_modules + source and runs `node server/index.js`.

FROM node:22-slim AS deps
WORKDIR /app

# Build deps for argon2 native binding (alpine variants of @node-rs/argon2
# already ship prebuilds, but keep this minimal in case of arch quirks).
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=optional && npx prisma generate

# ---------------------------------------------------------------------

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json package-lock.json ./
COPY server ./server
COPY lib ./lib
COPY demo ./demo
COPY index.html signup.html login.html styles.css script.js ./

# Cloud Run sets PORT (default 8080).
ENV PORT=8080
EXPOSE 8080

# Run pending migrations on boot, then start the server. In a multi-instance
# setup this is safe because `prisma migrate deploy` no-ops when the DB is
# already at head.
CMD ["sh", "-c", "npx prisma migrate deploy && node server/index.js"]
