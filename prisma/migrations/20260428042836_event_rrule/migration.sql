-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrenceUntil" TIMESTAMP(3),
ADD COLUMN     "rrule" TEXT;
