-- CreateTable
CREATE TABLE "OaElection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "electionDate" TIMESTAMP(3) NOT NULL,
    "lodgeName" TEXT,
    "lodgeNumber" TEXT,
    "oaTeamContact" TEXT,
    "oaTeamContactEmail" TEXT,
    "votingMembersCount" INTEGER,
    "votingThreshold" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OaElection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OaCandidate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "memberId" TEXT,
    "candidateName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'eligible',
    "votesFor" INTEGER,
    "votesAgainst" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OaCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OaElection_orgId_electionDate_idx" ON "OaElection"("orgId", "electionDate");

-- CreateIndex
CREATE INDEX "OaCandidate_orgId_electionId_idx" ON "OaCandidate"("orgId", "electionId");

-- AddForeignKey
ALTER TABLE "OaElection" ADD CONSTRAINT "OaElection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OaCandidate" ADD CONSTRAINT "OaCandidate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OaCandidate" ADD CONSTRAINT "OaCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "OaElection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OaCandidate" ADD CONSTRAINT "OaCandidate_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
