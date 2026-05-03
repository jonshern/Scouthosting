-- Persist the error events that lib/errorTracker.js already emits to
-- stdout. The /__super/errors page reads from this table and groups
-- by `fingerprint` (a stable hash of the error name + first stack
-- frame), so an exception thrown 47 times across a day shows as one
-- entry with a 47x counter rather than 47 lines.
--
-- orgId / userId are nullable: process-level fatal handlers fire
-- without a request, and apex requests don't have a resolved org.
-- ON DELETE SET NULL so deleting an org doesn't cascade away its
-- error history.

CREATE TABLE "ErrorLog" (
  "id"          TEXT PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "stack"       TEXT,
  "errorName"   TEXT,
  "method"      TEXT,
  "path"        TEXT,
  "orgId"       TEXT,
  "userId"      TEXT,
  "requestId"   TEXT,
  "ip"          TEXT,
  "release"     TEXT,
  "environment" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ErrorLog_orgId_fkey"  FOREIGN KEY ("orgId")  REFERENCES "Org"("id")  ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ErrorLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ErrorLog_fingerprint_createdAt_idx" ON "ErrorLog"("fingerprint", "createdAt");
CREATE INDEX "ErrorLog_createdAt_idx"             ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_orgId_createdAt_idx"       ON "ErrorLog"("orgId", "createdAt");
