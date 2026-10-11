-- CreateTable
CREATE TABLE "CounselorBadge" (
    "userId" TEXT NOT NULL,
    "badgeSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorBadge_pkey" PRIMARY KEY ("userId","badgeSlug")
);

-- CreateTable
CREATE TABLE "CounselorAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "counselorUserId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "badgeSlug" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounselorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementProgress" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "signedOffById" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementProgressEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementProgressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselorMeeting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "counselorUserId" TEXT NOT NULL,
    "badgeSlug" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "place" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounselorMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounselorMeetingScout" (
    "meetingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,

    CONSTRAINT "CounselorMeetingScout_pkey" PRIMARY KEY ("meetingId","memberId")
);

-- CreateTable
CREATE TABLE "CounselorMeetingNotify" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "memberId" TEXT,
    "forMemberId" TEXT,
    "userId" TEXT,

    CONSTRAINT "CounselorMeetingNotify_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CounselorBadge_badgeSlug_idx" ON "CounselorBadge"("badgeSlug");

-- CreateIndex
CREATE INDEX "CounselorAssignment_orgId_memberId_idx" ON "CounselorAssignment"("orgId", "memberId");

-- CreateIndex
CREATE INDEX "CounselorAssignment_orgId_counselorUserId_idx" ON "CounselorAssignment"("orgId", "counselorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "CounselorAssignment_counselorUserId_memberId_badgeSlug_key" ON "CounselorAssignment"("counselorUserId", "memberId", "badgeSlug");

-- CreateIndex
CREATE INDEX "RequirementProgress_orgId_idx" ON "RequirementProgress"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementProgress_memberId_requirementId_key" ON "RequirementProgress"("memberId", "requirementId");

-- CreateIndex
CREATE INDEX "RequirementProgressEvent_memberId_requirementId_createdAt_idx" ON "RequirementProgressEvent"("memberId", "requirementId", "createdAt");

-- CreateIndex
CREATE INDEX "RequirementProgressEvent_orgId_createdAt_idx" ON "RequirementProgressEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "CounselorMeeting_counselorUserId_startsAt_idx" ON "CounselorMeeting"("counselorUserId", "startsAt");

-- CreateIndex
CREATE INDEX "CounselorMeeting_orgId_startsAt_idx" ON "CounselorMeeting"("orgId", "startsAt");

-- CreateIndex
CREATE INDEX "CounselorMeetingScout_memberId_idx" ON "CounselorMeetingScout"("memberId");

-- CreateIndex
CREATE INDEX "CounselorMeetingNotify_meetingId_idx" ON "CounselorMeetingNotify"("meetingId");

-- AddForeignKey
ALTER TABLE "CounselorBadge" ADD CONSTRAINT "CounselorBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorAssignment" ADD CONSTRAINT "CounselorAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorAssignment" ADD CONSTRAINT "CounselorAssignment_counselorUserId_fkey" FOREIGN KEY ("counselorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorAssignment" ADD CONSTRAINT "CounselorAssignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementProgress" ADD CONSTRAINT "RequirementProgress_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementProgress" ADD CONSTRAINT "RequirementProgress_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementProgressEvent" ADD CONSTRAINT "RequirementProgressEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementProgressEvent" ADD CONSTRAINT "RequirementProgressEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorMeeting" ADD CONSTRAINT "CounselorMeeting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorMeeting" ADD CONSTRAINT "CounselorMeeting_counselorUserId_fkey" FOREIGN KEY ("counselorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorMeetingScout" ADD CONSTRAINT "CounselorMeetingScout_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CounselorMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorMeetingScout" ADD CONSTRAINT "CounselorMeetingScout_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounselorMeetingNotify" ADD CONSTRAINT "CounselorMeetingNotify_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "CounselorMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

