-- Event staffing (EventStaff) and per-audience event channels: an event
-- can now have several channels (staff / station / families), so
-- Channel.eventId loses its unique index.

-- DropIndex
DROP INDEX "Channel_eventId_key";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "audience" TEXT,
ADD COLUMN     "slotId" TEXT;

-- CreateTable
CREATE TABLE "EventStaff" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "counselorId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'volunteer',
    "slotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "rsvpTokenHash" TEXT,
    "notes" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventStaff_rsvpTokenHash_key" ON "EventStaff"("rsvpTokenHash");

-- CreateIndex
CREATE INDEX "EventStaff_orgId_eventId_idx" ON "EventStaff"("orgId", "eventId");

-- CreateIndex
CREATE INDEX "EventStaff_userId_idx" ON "EventStaff"("userId");

-- CreateIndex
CREATE INDEX "EventStaff_email_idx" ON "EventStaff"("email");

-- CreateIndex
CREATE INDEX "EventStaff_slotId_idx" ON "EventStaff"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "EventStaff_eventId_email_key" ON "EventStaff"("eventId", "email");

-- CreateIndex
CREATE INDEX "Channel_eventId_idx" ON "Channel"("eventId");

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "MeritBadgeCounselor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaff" ADD CONSTRAINT "EventStaff_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "SignupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "SignupSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

