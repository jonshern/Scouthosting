-- Shared fixed-window rate-limit counters (src/lib/security/rate-limit.ts).
-- The model shipped in #121 without its migration (prisma/migrations/ was
-- gitignored), so IF NOT EXISTS keeps databases that already got the
-- table from `prisma db push` happy.

CREATE TABLE IF NOT EXISTS "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
