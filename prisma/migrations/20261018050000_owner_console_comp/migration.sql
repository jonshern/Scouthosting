-- Owner console: a unit the platform owner gives free access to, until
-- a date. Expand-only: two nullable columns.
ALTER TABLE "Org" ADD COLUMN "compedUntil" TIMESTAMP(3);
ALTER TABLE "Org" ADD COLUMN "compedNote" TEXT;

-- Owner console: an account the platform owner turned off. Sign-in is
-- refused while it is set; sessions and tokens are revoked when it is.
ALTER TABLE "User" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "disabledReason" TEXT;
