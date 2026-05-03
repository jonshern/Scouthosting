-- Workspace-style ownership on Org. Adds a single canonical owner FK
-- (Slack "primary owner" / GitHub repo "owner" model) so billing,
-- plan-change, delete, and ownership-transfer can be gated independently
-- of the broader admin OrgMembership role. Backfilled from the existing
-- scoutmasterEmail column, falling back to the first admin membership.

ALTER TABLE "Org" ADD COLUMN "ownerId" TEXT;

ALTER TABLE "Org"
  ADD CONSTRAINT "Org_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Org_ownerId_idx" ON "Org"("ownerId");

-- Backfill: prefer the User whose email matches scoutmasterEmail (the
-- founder who signed up). Email match is case-insensitive — Org stores
-- whatever the leader typed, User.email is normalised lowercase.
UPDATE "Org"
   SET "ownerId" = (
     SELECT "u"."id"
       FROM "User" "u"
      WHERE LOWER("u"."email") = LOWER("Org"."scoutmasterEmail")
      LIMIT 1
   )
 WHERE "scoutmasterEmail" IS NOT NULL;

-- Fallback: any org without a matching user gets the earliest admin
-- membership as owner. Keeps the invariant "every existing org has an
-- owner unless every admin account was deleted before this migration".
UPDATE "Org"
   SET "ownerId" = (
     SELECT "om"."userId"
       FROM "OrgMembership" "om"
      WHERE "om"."orgId" = "Org"."id"
        AND "om"."role" = 'admin'
      ORDER BY "om"."id" ASC
      LIMIT 1
   )
 WHERE "ownerId" IS NULL;
