-- AlterTable
ALTER TABLE "SignupSlot" ADD COLUMN "allowWaitlist" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SlotAssignment" ADD COLUMN "waitlisted" BOOLEAN NOT NULL DEFAULT false;
