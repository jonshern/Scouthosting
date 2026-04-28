-- CreateTable
CREATE TABLE "EagleScout" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "projectName" TEXT,
    "memberId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleScout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EagleProject" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scoutName" TEXT NOT NULL,
    "beneficiary" TEXT,
    "mentorName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "workbookUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EagleProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohAward" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "award" TEXT NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EagleScout_orgId_earnedAt_idx" ON "EagleScout"("orgId", "earnedAt");

-- CreateIndex
CREATE INDEX "EagleProject_orgId_status_idx" ON "EagleProject"("orgId", "status");

-- CreateIndex
CREATE INDEX "CohAward_orgId_eventId_sortOrder_idx" ON "CohAward"("orgId", "eventId", "sortOrder");

-- AddForeignKey
ALTER TABLE "EagleScout" ADD CONSTRAINT "EagleScout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EagleProject" ADD CONSTRAINT "EagleProject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohAward" ADD CONSTRAINT "CohAward_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohAward" ADD CONSTRAINT "CohAward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
