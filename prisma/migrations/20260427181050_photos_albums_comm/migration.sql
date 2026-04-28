/*
  Warnings:

  - You are about to drop the column `album` on the `Photo` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `Photo` table. All the data in the column will be lost.
  - Added the required column `albumId` to the `Photo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `filename` to the `Photo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `Photo` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sizeBytes` to the `Photo` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Photo_orgId_album_idx";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "commPreference" TEXT NOT NULL DEFAULT 'email',
ADD COLUMN     "smsOptIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Photo" DROP COLUMN "album",
DROP COLUMN "url",
ADD COLUMN     "albumId" TEXT NOT NULL,
ADD COLUMN     "filename" TEXT NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "takenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Album_orgId_takenAt_idx" ON "Album"("orgId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Album_orgId_slug_key" ON "Album"("orgId", "slug");

-- CreateIndex
CREATE INDEX "Photo_orgId_albumId_sortOrder_idx" ON "Photo"("orgId", "albumId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Album" ADD CONSTRAINT "Album_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
