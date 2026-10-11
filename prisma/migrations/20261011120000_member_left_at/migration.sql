-- When a member left the unit (status became "alumni"). Drives the
-- youth-record retention sweep (src/lib/retention/scouts.ts).
ALTER TABLE "Member" ADD COLUMN "leftAt" TIMESTAMP(3);

-- Existing alumni: best guess is the last time the row changed.
UPDATE "Member" SET "leftAt" = "updatedAt" WHERE "status" = 'alumni';
