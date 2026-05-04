-- Per-recipient delivery progress for queued broadcast email + SMS.
-- Workers atomically increment deliveredCount or failedCount; the
-- /admin/email POST handler finalizes status once all jobs report in.
--
-- Existing rows pre-migration are all status="sent" with delivered =
-- recipientCount. Backfilling those values keeps the Sent history
-- page consistent.

ALTER TABLE "MailLog"
  ADD COLUMN "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedCount"    INTEGER NOT NULL DEFAULT 0;

-- Backfill: pre-existing logs were written synchronously with a final
-- status. Rows in status="sent"/"partial" had recipientCount delivered;
-- rows in "failed" had 0 delivered.
UPDATE "MailLog"
   SET "deliveredCount" = "recipientCount"
 WHERE status IN ('sent', 'partial');

UPDATE "MailLog"
   SET "failedCount" = "recipientCount"
 WHERE status = 'failed';
