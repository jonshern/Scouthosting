-- Stripe billing fields on Org. Webhook handler (lib/stripe.js) is the
-- single writer; lib/billingState.js derives the gate from these.

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired'
);

ALTER TABLE "Org"
  ADD COLUMN "stripeCustomerId"     TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "stripePriceId"        TEXT,
  ADD COLUMN "subscriptionStatus"   "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
  ADD COLUMN "trialEndsAt"          TIMESTAMP(3),
  ADD COLUMN "currentPeriodEnd"     TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd"    BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Org_stripeCustomerId_key"     ON "Org"("stripeCustomerId");
CREATE UNIQUE INDEX "Org_stripeSubscriptionId_key" ON "Org"("stripeSubscriptionId");

-- Backfill: pre-existing orgs get a 60-day trial from now. Demos
-- stay 'trialing' forever (their plan-gating bypass lives in code).
UPDATE "Org"
   SET "trialEndsAt" = NOW() + INTERVAL '60 days'
 WHERE "trialEndsAt" IS NULL;
