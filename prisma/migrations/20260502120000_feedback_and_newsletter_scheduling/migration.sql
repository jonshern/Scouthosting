-- Feedback / public roadmap board + Newsletter scheduling & rules.
-- Source designs:
--   design_handoff_compass/designs/feedback.jsx
--   design_handoff_compass/designs/newsletter.jsx

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('submitted', 'triaged', 'building', 'shipped', 'declined');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('feature', 'bug', 'help');

-- CreateEnum
CREATE TYPE "FeedbackScope" AS ENUM ('org', 'global');

-- CreateEnum
CREATE TYPE "NewsletterRuleKind" AS ENUM (
  'rsvp_nudge',
  'dues_reminder',
  'post_event_recap',
  'eagle_coh_invite',
  'new_family_drip',
  'reengage_quiet',
  'birthday',
  'packing_list',
  'medform_expiry',
  'custom'
);

-- CreateTable
CREATE TABLE "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "userId" TEXT,
    "authorEmail" TEXT,
    "authorName" TEXT,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'feature',
    "scope" "FeedbackScope" NOT NULL DEFAULT 'org',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'submitted',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "context" JSONB,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "lastUpdate" TEXT,
    "lastUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackComment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSchedule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL DEFAULT 7,
    "localTime" TEXT NOT NULL DEFAULT '19:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "senderName" TEXT,
    "replyToEmail" TEXT,
    "minStories" INTEGER NOT NULL DEFAULT 2,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lastDraftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "NewsletterRuleKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackRequest_scope_status_voteCount_idx" ON "FeedbackRequest"("scope", "status", "voteCount");
CREATE INDEX "FeedbackRequest_orgId_createdAt_idx" ON "FeedbackRequest"("orgId", "createdAt");
CREATE INDEX "FeedbackRequest_category_idx" ON "FeedbackRequest"("category");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVote_requestId_userId_key" ON "FeedbackVote"("requestId", "userId");
CREATE INDEX "FeedbackVote_userId_idx" ON "FeedbackVote"("userId");

-- CreateIndex
CREATE INDEX "FeedbackComment_requestId_createdAt_idx" ON "FeedbackComment"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSchedule_orgId_key" ON "NewsletterSchedule"("orgId");

-- CreateIndex
CREATE INDEX "NewsletterRule_orgId_enabled_idx" ON "NewsletterRule"("orgId", "enabled");
CREATE INDEX "NewsletterRule_kind_idx" ON "NewsletterRule"("kind");

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackVote" ADD CONSTRAINT "FeedbackVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackComment" ADD CONSTRAINT "FeedbackComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterSchedule" ADD CONSTRAINT "NewsletterSchedule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NewsletterRule" ADD CONSTRAINT "NewsletterRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
