-- Track the last time a return-reminder email was sent for each open loan.
-- Drives the 24-hour throttle and the "last nudged …" UI on the open-loans
-- roster.
ALTER TABLE "EquipmentLoan" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
