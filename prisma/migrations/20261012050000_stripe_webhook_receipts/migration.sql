-- CreateTable
CREATE TABLE "StripeWebhookReceipt" (
    "key" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookReceipt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "StripeWebhookReceipt_createdAt_idx" ON "StripeWebhookReceipt"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reversesId_key" ON "Transaction"("reversesId");

