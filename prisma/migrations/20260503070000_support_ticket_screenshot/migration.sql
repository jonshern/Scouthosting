-- Bug-report screenshots on SupportTicket. The in-page widget
-- captures the user's current viewport via html2canvas, uploads the
-- PNG through the existing storage driver, and records the filename
-- + viewport metadata here. Operator views the image inline on
-- /__super/support/:id.

ALTER TABLE "SupportTicket"
  ADD COLUMN "screenshotFilename" TEXT,
  ADD COLUMN "screenshotMimeType" TEXT,
  ADD COLUMN "viewportPath"       TEXT,
  ADD COLUMN "viewportWidth"      INTEGER,
  ADD COLUMN "viewportHeight"     INTEGER;
