-- CreateTable
CREATE TABLE "EquipmentLoan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "memberId" TEXT,
    "borrowerName" TEXT NOT NULL,
    "borrowerEmail" TEXT,
    "checkedOutAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentLoan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentLoan_orgId_equipmentId_checkedOutAt_idx" ON "EquipmentLoan"("orgId", "equipmentId", "checkedOutAt");

-- CreateIndex
CREATE INDEX "EquipmentLoan_orgId_returnedAt_idx" ON "EquipmentLoan"("orgId", "returnedAt");

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentLoan" ADD CONSTRAINT "EquipmentLoan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
