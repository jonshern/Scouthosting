-- Newsletter — recurring digest the unit emails its families. Distinct from
-- a one-off broadcast (MailLog) because the leader writes an intro then
-- auto-includes recent posts + upcoming events. Each row is one issue.
CREATE TABLE "Newsletter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "includedPostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includedEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience" TEXT NOT NULL DEFAULT 'everyone',
    "audiencePatrol" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "mailLogId" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'members',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Newsletter_mailLogId_key" ON "Newsletter"("mailLogId");
CREATE INDEX "Newsletter_orgId_publishedAt_idx" ON "Newsletter"("orgId", "publishedAt");
CREATE INDEX "Newsletter_orgId_status_idx" ON "Newsletter"("orgId", "status");

ALTER TABLE "Newsletter" ADD CONSTRAINT "Newsletter_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Newsletter" ADD CONSTRAINT "Newsletter_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
