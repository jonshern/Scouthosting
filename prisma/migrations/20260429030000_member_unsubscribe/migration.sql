-- AlterTable
ALTER TABLE "Member" ADD COLUMN "emailUnsubscribed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
