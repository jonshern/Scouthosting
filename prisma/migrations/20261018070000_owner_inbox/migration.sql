-- Owner console inbox: which product a question or feedback came from,
-- extra context the app sent, and the owner's emailed replies.
-- Expand-only.
ALTER TABLE "SupportTicket" ADD COLUMN "product" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "context" JSONB;

CREATE TABLE "SupportReply" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportReply_ticketId_createdAt_idx" ON "SupportReply"("ticketId", "createdAt");
CREATE INDEX "SupportTicket_product_status_idx" ON "SupportTicket"("product", "status");

ALTER TABLE "SupportReply" ADD CONSTRAINT "SupportReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
