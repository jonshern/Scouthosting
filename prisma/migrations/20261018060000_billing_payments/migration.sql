-- Owner console billing report: one row per paid Stripe invoice for a
-- unit's Compass subscription, written by the webhook. Expand-only.
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayment_stripeInvoiceId_key" ON "BillingPayment"("stripeInvoiceId");
CREATE INDEX "BillingPayment_paidAt_idx" ON "BillingPayment"("paidAt");
CREATE INDEX "BillingPayment_orgId_paidAt_idx" ON "BillingPayment"("orgId", "paidAt");

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
