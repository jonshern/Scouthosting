-- Lantern: a scout's own device, set up by the parent with a one-time
-- code (no scout account, email or password), and who checked each step.

-- AlterTable
ALTER TABLE "JourneyProgress" ADD COLUMN     "byScout" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JourneyScoutDevice" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "JourneyScoutDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyPairCode" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyPairCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JourneyScoutDevice_tokenHash_key" ON "JourneyScoutDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "JourneyScoutDevice_scoutId_idx" ON "JourneyScoutDevice"("scoutId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyPairCode_codeHash_key" ON "JourneyPairCode"("codeHash");

-- CreateIndex
CREATE INDEX "JourneyPairCode_scoutId_idx" ON "JourneyPairCode"("scoutId");

-- AddForeignKey
ALTER TABLE "JourneyScoutDevice" ADD CONSTRAINT "JourneyScoutDevice_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "JourneyScout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyPairCode" ADD CONSTRAINT "JourneyPairCode_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "JourneyScout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

