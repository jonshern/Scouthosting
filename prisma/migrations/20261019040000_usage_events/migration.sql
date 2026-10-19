-- Usage tracking for the owner console (lib/usage): UsageEvent rows and
-- the daily salt behind their visitor hash. Expand-only.
-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "referrer" TEXT,
    "source" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "role" TEXT NOT NULL,
    "visitorHash" TEXT,
    "props" JSONB,
    "userId" TEXT,
    "orgId" TEXT,
    "scoutId" TEXT,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageSalt" (
    "day" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageSalt_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_product_createdAt_idx" ON "UsageEvent"("product", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_orgId_createdAt_idx" ON "UsageEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_visitorHash_createdAt_idx" ON "UsageEvent"("visitorHash", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_scoutId_idx" ON "UsageEvent"("scoutId");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "JourneyScout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

