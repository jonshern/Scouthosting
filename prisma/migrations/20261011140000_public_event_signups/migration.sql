-- Public event sign-ups (Waypoint badge days): a public slug on
-- Event, a stable key on SignupSlot, and one seat per scout per
-- guardian email on SlotAssignment.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "publicSlug" TEXT;

-- AlterTable
ALTER TABLE "SignupSlot" ADD COLUMN "key" TEXT;

-- AlterTable
ALTER TABLE "SlotAssignment" ADD COLUMN "phone" TEXT,
ADD COLUMN "scoutName" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "SlotAssignment_slotId_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicSlug_key" ON "Event"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "SignupSlot_eventId_key_key" ON "SignupSlot"("eventId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SlotAssignment_slotId_email_scoutName_key" ON "SlotAssignment"("slotId", "email", "scoutName");
