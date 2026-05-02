-- Tracking events for emails + SMS messages. One row per open or click,
-- tied to the MailLog row that recorded the original send. Recipient is
-- identified by the email or phone in the snapshot so we can roll up
-- per-person engagement without joining back to the live Member row
-- (which may have changed since the send).
CREATE TABLE "MailEvent" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "orgId"       TEXT NOT NULL,
  "mailLogId"   TEXT NOT NULL,
  "recipient"   TEXT NOT NULL,           -- email or E.164 phone
  "kind"        TEXT NOT NULL,            -- "open" | "click"
  "url"         TEXT,                     -- destination URL for clicks
  "userAgent"   TEXT,
  "ipHash"      TEXT,                     -- SHA-256 of the request IP, never the raw IP
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MailEvent_mailLog_fkey" FOREIGN KEY ("mailLogId") REFERENCES "MailLog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MailEvent_mailLogId_kind_idx" ON "MailEvent" ("mailLogId", "kind");
CREATE INDEX "MailEvent_orgId_createdAt_idx" ON "MailEvent" ("orgId", "createdAt");
