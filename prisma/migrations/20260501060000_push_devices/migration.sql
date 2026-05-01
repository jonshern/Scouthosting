-- Mobile push-notification device registration.

CREATE TABLE "PushDevice" (
  "id"            TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "token"         TEXT NOT NULL UNIQUE,
  "provider"      TEXT NOT NULL DEFAULT 'expo',
  "deviceLabel"   TEXT,
  "platform"      TEXT,
  "retiredAt"     TIMESTAMP(3),
  "retiredReason" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");
CREATE INDEX "PushDevice_retiredAt_idx" ON "PushDevice"("retiredAt");
