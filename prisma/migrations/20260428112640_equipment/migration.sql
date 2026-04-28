-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "serialOrTag" TEXT,
    "location" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_orgId_category_idx" ON "Equipment"("orgId", "category");

-- CreateIndex
CREATE INDEX "Equipment_orgId_location_idx" ON "Equipment"("orgId", "location");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
