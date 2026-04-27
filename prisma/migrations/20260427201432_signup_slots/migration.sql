-- CreateTable
CREATE TABLE "SignupSlot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignupSlot_orgId_eventId_sortOrder_idx" ON "SignupSlot"("orgId", "eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "SlotAssignment_orgId_slotId_idx" ON "SlotAssignment"("orgId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotAssignment_slotId_userId_key" ON "SlotAssignment"("slotId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotAssignment_slotId_email_key" ON "SlotAssignment"("slotId", "email");

-- AddForeignKey
ALTER TABLE "SignupSlot" ADD CONSTRAINT "SignupSlot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupSlot" ADD CONSTRAINT "SignupSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotAssignment" ADD CONSTRAINT "SlotAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotAssignment" ADD CONSTRAINT "SlotAssignment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "SignupSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotAssignment" ADD CONSTRAINT "SlotAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
