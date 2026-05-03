-- Direct messaging support — read receipts + email-reminder cron.
--
-- ChannelMember.lastReadAt: high-water mark of when this member last
--   opened the channel. Bumped on channel-detail GET and an explicit
--   "mark read" endpoint. Drives the "Seen by …" receipt UI and the
--   cron sweep that emails reminders for unread DMs.
--
-- Message.emailReminderSentAt: idempotency stamp for the reminder
--   cron. Never re-fires for the same message even if the recipient
--   stays unread for days. Indexed alongside createdAt so the cron's
--   "find unread DMs older than 30 minutes" scan stays cheap.

ALTER TABLE "ChannelMember"
  ADD COLUMN "lastReadAt" TIMESTAMP(3);

ALTER TABLE "Message"
  ADD COLUMN "emailReminderSentAt" TIMESTAMP(3);

CREATE INDEX "Message_emailReminderSentAt_createdAt_idx"
  ON "Message"("emailReminderSentAt", "createdAt");
