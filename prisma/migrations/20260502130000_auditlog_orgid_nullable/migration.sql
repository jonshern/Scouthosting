-- AuditLog.orgId becomes nullable so the first-party telemetry beacon
-- can write anonymous marketing-funnel events (apex visits with no
-- org, no user) into the same rollup table.

-- Drop the existing FK so we can change the column type to nullable.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_orgId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "orgId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New index over (action, createdAt) so the rollup helper can scan
-- "what happened across all orgs in the last week" without a full
-- table scan.
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx"
  ON "AuditLog"("action", "createdAt");
