-- Group chat foundation. Channel + ChannelMember + Message + Reaction tables,
-- plus an ApiToken table for the mobile app's bearer-token auth and a
-- yptCurrentUntil column on OrgMembership for the two-deep guard.

ALTER TABLE "OrgMembership" ADD COLUMN "yptCurrentUntil" TIMESTAMP(3);

-- API tokens. tokenHash is sha256 of the raw token; the raw value is shown
-- to the caller exactly once.
CREATE TABLE "ApiToken" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "tokenHash"  TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Channel.
CREATE TABLE "Channel" (
    "id"              TEXT NOT NULL,
    "orgId"           TEXT NOT NULL,
    "kind"            TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "patrolName"      TEXT,
    "eventId"         TEXT,
    "isSuspended"     BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "archivedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Channel_eventId_key" ON "Channel"("eventId");
CREATE INDEX "Channel_orgId_kind_idx" ON "Channel"("orgId", "kind");
CREATE INDEX "Channel_orgId_archivedAt_idx" ON "Channel"("orgId", "archivedAt");

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ChannelMember.
CREATE TABLE "ChannelMember" (
    "id"                 TEXT NOT NULL,
    "channelId"          TEXT NOT NULL,
    "userId"             TEXT NOT NULL,
    "role"               TEXT NOT NULL DEFAULT 'member',
    "joinedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mutedUntil"         TIMESTAMP(3),
    "addedAutomatically" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChannelMember_channelId_userId_key" ON "ChannelMember"("channelId", "userId");
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");

ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Message.
CREATE TABLE "Message" (
    "id"             TEXT NOT NULL,
    "channelId"      TEXT NOT NULL,
    "authorId"       TEXT,
    "body"           TEXT NOT NULL,
    "attachmentJson" JSONB,
    "pinned"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt"       TIMESTAMP(3),
    "deletedAt"      TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reaction (composite PK keeps a user from doubling up the same emoji).
CREATE TABLE "Reaction" (
    "messageId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "emoji"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji")
);

CREATE INDEX "Reaction_messageId_idx" ON "Reaction"("messageId");

ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
