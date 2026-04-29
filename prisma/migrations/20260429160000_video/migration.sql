-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "recordedAt" TIMESTAMP(3),
    "notes" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'members',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Video_orgId_sortOrder_idx" ON "Video"("orgId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
