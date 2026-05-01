-- Super-admin console primitives.
--
-- 1. User.isSuperAdmin — Compass operator flag. Bypasses all per-org
--    auth and unlocks /__super on the apex. Granted out-of-band; never
--    via an HTTP form.
-- 2. Org.features — JSONB feature-flag bag, per-org. Read via
--    lib/featureFlags.js with sensible defaults for unknown keys.
-- 3. Org.suspendedAt + Org.suspendedReason — non-payment / abuse hold.
--    Suspended orgs go read-only for admins; the public site still
--    renders so members aren't left in the dark.
-- 4. SupportTicket — inbound triage queue (leaders + members + apex
--    visitors can all file).
-- 5. Refund — paired with Stripe refund or manual write-off.

ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Org" ADD COLUMN "features" JSONB;
ALTER TABLE "Org" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Org" ADD COLUMN "suspendedReason" TEXT;

CREATE TABLE "SupportTicket" (
  "id"             TEXT PRIMARY KEY,
  "orgId"          TEXT,
  "userId"         TEXT,
  "fromEmail"      TEXT NOT NULL,
  "fromName"       TEXT,
  "category"       TEXT NOT NULL DEFAULT 'question',
  "subject"        TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'open',
  "priority"       TEXT NOT NULL DEFAULT 'normal',
  "assignedTo"     TEXT,
  "resolutionNote" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL
);
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
CREATE INDEX "SupportTicket_orgId_idx" ON "SupportTicket"("orgId");

CREATE TABLE "Refund" (
  "id"          TEXT PRIMARY KEY,
  "orgId"       TEXT NOT NULL,
  "paymentRef"  TEXT,
  "amountCents" INTEGER NOT NULL,
  "reason"      TEXT NOT NULL,
  "issuedBy"    TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'issued',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Refund_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE
);
CREATE INDEX "Refund_orgId_createdAt_idx" ON "Refund"("orgId", "createdAt");
