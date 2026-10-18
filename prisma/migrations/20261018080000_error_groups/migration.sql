-- Owner console errors view: which service or app an error came from,
-- what the app sent with a crash report, and errors the owner marked
-- fixed. Expand-only.
ALTER TABLE "ErrorLog" ADD COLUMN "service" TEXT;
ALTER TABLE "ErrorLog" ADD COLUMN "context" JSONB;
CREATE INDEX "ErrorLog_service_createdAt_idx" ON "ErrorLog"("service", "createdAt");

CREATE TABLE "ErrorResolution" (
    "fingerprint" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "note" TEXT,

    CONSTRAINT "ErrorResolution_pkey" PRIMARY KEY ("fingerprint")
);
