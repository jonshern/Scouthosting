-- Photo gains chat-message attachment as a parallel surface to album-
-- attachment. albumId becomes optional; messageId is the new optional
-- chat tie. uploaderUserId tracks who originally posted (chat photos
-- need this for moderation / audit). width + height are picture-info
-- (set on upload via image-size detection if available; null otherwise).

ALTER TABLE "Photo" ALTER COLUMN "albumId" DROP NOT NULL;
ALTER TABLE "Photo" ADD COLUMN "messageId" TEXT;
ALTER TABLE "Photo" ADD COLUMN "uploaderUserId" TEXT;
ALTER TABLE "Photo" ADD COLUMN "width" INTEGER;
ALTER TABLE "Photo" ADD COLUMN "height" INTEGER;

-- Restore albumId FK with the cascade we already had, but allow nulls.
ALTER TABLE "Photo" DROP CONSTRAINT "Photo_albumId_fkey";
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploaderUserId_fkey"
    FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Photo_orgId_messageId_idx" ON "Photo"("orgId", "messageId");
