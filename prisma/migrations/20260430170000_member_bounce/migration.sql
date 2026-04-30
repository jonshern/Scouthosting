-- Bounce / complaint state from mail-provider webhooks. audienceFor
-- treats a non-null bouncedAt as a hard stop on the email channel,
-- the same way emailUnsubscribed=true does today.

ALTER TABLE "Member" ADD COLUMN "bouncedAt" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN "bounceReason" TEXT;
