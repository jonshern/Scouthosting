-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "parentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scoutbookUserId" TEXT;
