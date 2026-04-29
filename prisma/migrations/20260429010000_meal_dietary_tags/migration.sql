-- AlterTable
ALTER TABLE "Meal" ADD COLUMN "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
