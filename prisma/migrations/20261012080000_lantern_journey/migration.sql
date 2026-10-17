-- Lantern: scouts a parent follows from their own account (JourneyScout)
-- and the steps checked off on each scout's trail (JourneyProgress).

-- CreateTable
CREATE TABLE "JourneyScout" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "encName" BYTEA NOT NULL,
    "path" JSONB NOT NULL DEFAULT '[]',
    "custom" JSONB NOT NULL DEFAULT '{}',
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyScout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyProgress" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneOn" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JourneyScout_ownerUserId_idx" ON "JourneyScout"("ownerUserId");

-- CreateIndex
CREATE INDEX "JourneyScout_memberId_idx" ON "JourneyScout"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyProgress_scoutId_key_key" ON "JourneyProgress"("scoutId", "key");

-- AddForeignKey
ALTER TABLE "JourneyScout" ADD CONSTRAINT "JourneyScout_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyScout" ADD CONSTRAINT "JourneyScout_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyProgress" ADD CONSTRAINT "JourneyProgress_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "JourneyScout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

