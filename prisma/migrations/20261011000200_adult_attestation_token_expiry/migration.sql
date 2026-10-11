-- New sign-ups must confirm they are an adult. Accounts that already
-- exist are treated as having confirmed when they were created.
ALTER TABLE "User" ADD COLUMN "adultAttestedAt" TIMESTAMP(3);
UPDATE "User" SET "adultAttestedAt" = "createdAt";

-- API tokens (mobile app) now expire. Existing tokens get 90 days from
-- today so signed-in phones keep working until then.
ALTER TABLE "ApiToken" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "ApiToken" SET "expiresAt" = NOW() + INTERVAL '90 days' WHERE "revokedAt" IS NULL;
