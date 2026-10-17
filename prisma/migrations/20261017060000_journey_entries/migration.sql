-- Lantern: logs, notes, photos and "ready" marks on a scout's requirements.
CREATE TABLE "JourneyEntry" (
    "id" TEXT NOT NULL,
    "scoutId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT,
    "amount" DOUBLE PRECISION,
    "unit" TEXT,
    "encText" BYTEA,
    "fileKey" TEXT,
    "mimeType" TEXT,
    "byUserId" TEXT,
    "byRole" TEXT NOT NULL DEFAULT 'parent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JourneyEntry_scoutId_clientId_key" ON "JourneyEntry"("scoutId", "clientId");
CREATE INDEX "JourneyEntry_scoutId_key_idx" ON "JourneyEntry"("scoutId", "key");

ALTER TABLE "JourneyEntry" ADD CONSTRAINT "JourneyEntry_scoutId_fkey" FOREIGN KEY ("scoutId") REFERENCES "JourneyScout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
