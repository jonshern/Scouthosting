-- AlterTable
ALTER TABLE "GearItem" ADD COLUMN "equipmentId" TEXT;

-- CreateIndex
CREATE INDEX "GearItem_orgId_equipmentId_idx" ON "GearItem"("orgId", "equipmentId");

-- AddForeignKey
ALTER TABLE "GearItem" ADD CONSTRAINT "GearItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
