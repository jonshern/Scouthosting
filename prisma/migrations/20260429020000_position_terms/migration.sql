-- CreateTable
CREATE TABLE "PositionTerm" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionTerm_orgId_memberId_startedAt_idx" ON "PositionTerm"("orgId", "memberId", "startedAt");

-- CreateIndex
CREATE INDEX "PositionTerm_orgId_endedAt_idx" ON "PositionTerm"("orgId", "endedAt");

-- AddForeignKey
ALTER TABLE "PositionTerm" ADD CONSTRAINT "PositionTerm_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionTerm" ADD CONSTRAINT "PositionTerm_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
