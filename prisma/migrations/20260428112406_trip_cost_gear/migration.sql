-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "unitCost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GearItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tripPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "assignedTo" TEXT,
    "notes" TEXT,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GearItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GearItem_orgId_tripPlanId_sortOrder_idx" ON "GearItem"("orgId", "tripPlanId", "sortOrder");

-- AddForeignKey
ALTER TABLE "GearItem" ADD CONSTRAINT "GearItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GearItem" ADD CONSTRAINT "GearItem_tripPlanId_fkey" FOREIGN KEY ("tripPlanId") REFERENCES "TripPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
