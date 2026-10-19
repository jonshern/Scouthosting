-- Owner console sign-ups: per-sign-up status, note and follow-up day,
-- and the owner's email invites. Expand-only.
CREATE TABLE "SignupReview" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "note" TEXT,
    "followUpOn" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignupReview_entityType_entityId_key" ON "SignupReview"("entityType", "entityId");
CREATE INDEX "SignupReview_status_followUpOn_idx" ON "SignupReview"("status", "followUpOn");

CREATE TABLE "OwnerInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "product" TEXT NOT NULL,
    "note" TEXT,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerInvite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OwnerInvite_email_idx" ON "OwnerInvite"("email");
