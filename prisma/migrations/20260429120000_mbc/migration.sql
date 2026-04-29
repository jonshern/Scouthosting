-- CreateTable
CREATE TABLE "MeritBadgeCounselor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memberId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeritBadgeCounselor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeritBadgeCounselor_orgId_name_idx" ON "MeritBadgeCounselor"("orgId", "name");

-- CreateIndex
CREATE INDEX "MeritBadgeCounselor_orgId_memberId_idx" ON "MeritBadgeCounselor"("orgId", "memberId");

-- AddForeignKey
ALTER TABLE "MeritBadgeCounselor" ADD CONSTRAINT "MeritBadgeCounselor_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritBadgeCounselor" ADD CONSTRAINT "MeritBadgeCounselor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
